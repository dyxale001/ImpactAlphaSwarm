import { useCallback, useEffect, useState } from "react";
import {
  UploadApiError,
  getUploadedFund,
  listUploadedFunds,
  type UploadedFundDetail,
  type UploadedFundSummary,
} from "../services/api/fundUploads";
import { DETAIL_LOAD_FAILED, LIST_FAILED } from "../utils/fundUploadsCopy";

/** The reader's uploaded funds, with a `reload` for after a save or delete. */
export function useUploadedFunds(enabled = true) {
  const [funds, setFunds] = useState<UploadedFundSummary[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    listUploadedFunds(LIST_FAILED)
      .then((res) => {
        if (!cancelled) setFunds(res);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error("Error loading uploaded funds:", e);
        setError(LIST_FAILED);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, version]);

  return { funds, isLoading, error, reload };
}

/** One uploaded fund. `notFound` is kept apart from `error`, as on the
 *  catalogue's own page: a fund that is not theirs (or was removed) is a dead
 *  link, a failed request is worth retrying. */
export function useUploadedFund(id: string | undefined) {
  const [fund, setFund] = useState<UploadedFundDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setNotFound(true);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    getUploadedFund(id, DETAIL_LOAD_FAILED)
      .then((res) => {
        if (!cancelled) setFund(res);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof UploadApiError && e.status === 404) setNotFound(true);
        else {
          console.error("Error loading uploaded fund:", e);
          setError(DETAIL_LOAD_FAILED);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { fund, isLoading, error, notFound };
}
