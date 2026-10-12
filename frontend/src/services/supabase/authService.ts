import { supabase } from "../../lib/supabase";
import { UserProfile, UserAnalysis } from "../../types/auth";

const DEACTIVATED_ACCOUNT_MESSAGE =
  "Your account has been deactivated. Please contact an administrator to reactivate your account.";

export async function signInActiveAccount(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "user_banned" || (!error.code && error.message.toLowerCase().includes("banned"))) {
      throw new Error(DEACTIVATED_ACCOUNT_MESSAGE);
    }
    throw new Error(error.code === "invalid_credentials" || error.message === "Invalid login credentials"
      ? "Incorrect email or password. Please try again." : error.message);
  }
  try {
    if (!data.user) throw new Error("Could not verify your login. Please try again.");
    const { data: profile, error: profileError } = await supabase.from("users")
      .select("role,is_active").eq("id", data.user.id).maybeSingle();
    if (profileError) throw new Error("Could not verify account status. Please try again.");
    if (profile && profile.is_active !== true) {
      throw new Error(DEACTIVATED_ACCOUNT_MESSAGE);
    }
    // New users may not have a profile yet; normal profile loading creates it.
    return profile;
  } catch (error) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    throw error;
  }
}

export async function fetchUserProfileData(userId: string) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || authData.user?.id !== userId) {
    return { error: authError || new Error("Could not verify your session. Please sign in again.") };
  }
  // Fetch profile data
  let { data: profileData, error: profileError } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("Error fetching user profile:", profileError.message);
    return { error: profileError };
  }

  // Auto create profile if missing
  if (!profileData) {
    const metadata = authData.user.user_metadata || {};

    const { data: newProfile, error: insertError } = await supabase
      .from("users")
      .insert([
        {
          id: userId,
          first_name: metadata.first_name || "",
          last_name: metadata.last_name || "",
          email: authData.user.email || "",
          role: "user",
          learning_xp: 0,
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error(
        "Error creating user profile on first login:",
        insertError.message,
      );
      return { error: insertError };
    }
    profileData = newProfile;
  }

  const { data: analysisData, error: analysisError } = await supabase
    .from("user_analysis")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (analysisError) return { error: analysisError };

  return {
    profile: (profileData as UserProfile) || null,
    analysis: (analysisData as UserAnalysis) || null,
    error: null,
  };
}
