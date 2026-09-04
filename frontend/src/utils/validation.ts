export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password: string): { isValid: boolean; message: string } => {
  if (password.length < 8) {
    return { isValid: false, message: "Password must be at least 8 characters long." };
  }
  if (!/[A-Z]/.test(password)) {
    return { isValid: false, message: "Password must contain at least one uppercase letter." };
  }
  if (!/[a-z]/.test(password)) {
    return { isValid: false, message: "Password must contain at least one lowercase letter." };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, message: "Password must contain at least one number." };
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return { isValid: false, message: "Password must contain at least one special character." };
  }
  
  return { isValid: true, message: "" };
};

/** Are all four goal questions answered?
 *
 * Named per question rather than "please answer all of them", because the block
 * is four cards on a long page and "which one did I miss" is the question a
 * reader actually has. Reports the first gap in the order they are asked, so
 * following the message walks down the page rather than back up it. */
export const validateGoals = (
  answers: Record<string, string>,
): { isValid: boolean; message: string } => {
  const required: Array<[string, string]> = [
    ["goal_horizon", "when you expect to need this money"],
    ["goal_purpose", "what this money is for"],
    ["goal_account_type", "which kind of account you are investing through"],
    ["goal_contribution", "how you plan to put money in"],
  ];

  for (const [id, description] of required) {
    if (!answers[id]) {
      return { isValid: false, message: `Please tell us ${description}.` };
    }
  }

  return { isValid: true, message: "" };
};