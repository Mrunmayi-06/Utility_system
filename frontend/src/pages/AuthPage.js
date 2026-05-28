import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_REGEX = /^[A-Za-z ]{2,50}$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
const DEPARTMENTS = ["Electricity", "Gas", "Water"];

const getUsers = () => {
  try {
    return JSON.parse(localStorage.getItem("ubms_users") || "[]");
  } catch {
    return [];
  }
};

const setUsers = (users) => {
  localStorage.setItem("ubms_users", JSON.stringify(users));
};

function AuthPage({ onAuthSuccess }) {
  const [mode, setMode] = useState("signin");
  const [authStep, setAuthStep] = useState("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    department: "Electricity"
  });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [forgot, setForgot] = useState({
    email: "",
    name: "",
    department: "Electricity",
    newPassword: "",
    confirmNewPassword: ""
  });
  const [forgotEmailLocked, setForgotEmailLocked] = useState("");

  useEffect(() => {
    setMode("signin");
    setAuthStep("signin");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setForm({
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      department: "Electricity"
    });
    setForgot({
      email: "",
      name: "",
      department: "Electricity",
      newPassword: "",
      confirmNewPassword: ""
    });
    setForgotEmailLocked("");
    setErrors({});
    setMessage("");
  }, []);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
    setMessage("");
  };

  const handleEmailBlur = () => {
    const email = form.email?.trim().toLowerCase();
    if (!email) return;
    const users = getUsers();
    const found = users.find((u) => u.email.toLowerCase() === email);
    if (found && DEPARTMENTS.includes(found.department)) {
      setForm((prev) => ({ ...prev, department: found.department }));
    }
  };

  const updateForgotField = (field, value) => {
    setForgot((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
    setMessage("");
  };

  const validateSignUp = () => {
    const nextErrors = {};

    if (!NAME_REGEX.test(form.name.trim())) {
      nextErrors.name = "Enter a valid name (2-50 letters/spaces).";
    }
    if (!EMAIL_REGEX.test(form.email.trim())) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!STRONG_PASSWORD_REGEX.test(form.password)) {
      nextErrors.password = "Password must be 8+ chars with upper, lower, number, and symbol.";
    }
    if (!DEPARTMENTS.includes(form.department)) {
      nextErrors.department = "Select a valid department.";
    }
    if (form.password !== form.confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    return nextErrors;
  };

  const validateSignIn = () => {
    const nextErrors = {};

    if (!EMAIL_REGEX.test(form.email.trim())) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!form.password) {
      nextErrors.password = "Password is required.";
    }

    return nextErrors;
  };

  const handleSignUp = () => {
    const nextErrors = validateSignUp();
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    const users = getUsers();
    const exists = users.some((u) => u.email.toLowerCase() === form.email.trim().toLowerCase());

    if (exists) {
      setErrors({ email: "Email already registered. Please sign in." });
      return;
    }

    const user = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      department: form.department
    };

    setUsers([...users, user]);
    onAuthSuccess({ name: user.name, email: user.email, department: user.department });
  };

  const handleSignIn = () => {
    const nextErrors = validateSignIn();
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    const users = getUsers();
    const user = users.find(
      (u) =>
        u.email.toLowerCase() === form.email.trim().toLowerCase() &&
        u.password === form.password
    );

    if (!user) {
      setMessage("Invalid credentials.");
      return;
    }

    // If the stored user has no valid department but the sign-in form
    // includes a valid department selection, update the stored user
    // and proceed. Otherwise require a valid stored department.
    if (!DEPARTMENTS.includes(user.department)) {
      if (DEPARTMENTS.includes(form.department)) {
        // persist department to stored users
        const updated = users.map((u) => {
          if (u.email.toLowerCase() === user.email.toLowerCase()) {
            return { ...u, department: form.department };
          }
          return u;
        });
        setUsers(updated);
        user.department = form.department;
      } else {
        setMessage("This account has no valid department assigned. Please sign up again.");
        return;
      }
    }

    onAuthSuccess({
      name: user.name,
      email: user.email,
      department: user.department
    });
  };

  const openForgotPassword = () => {
    setAuthStep("forgot-verify");
    setMessage("");
    setErrors({});
    setForgot((prev) => ({
      ...prev,
      email: form.email || "",
      name: "",
      department: "Electricity",
      newPassword: "",
      confirmNewPassword: ""
    }));
    setForgotEmailLocked("");
  };

  const handleForgotVerification = () => {
    const nextErrors = {};

    if (!EMAIL_REGEX.test(forgot.email.trim())) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!NAME_REGEX.test(forgot.name.trim())) {
      nextErrors.name = "Enter your registered name.";
    }
    if (!DEPARTMENTS.includes(forgot.department)) {
      nextErrors.department = "Select a valid department.";
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    const users = getUsers();
    const user = users.find(
      (u) =>
        u.email.toLowerCase() === forgot.email.trim().toLowerCase() &&
        u.name.trim().toLowerCase() === forgot.name.trim().toLowerCase() &&
        u.department === forgot.department
    );

    if (!user) {
      setMessage("Verification failed. Check your registered email, name, and department.");
      return;
    }

    setForgotEmailLocked(user.email.toLowerCase());
    setAuthStep("forgot-reset");
    setErrors({});
    setMessage("Identity verified. Set a new password.");
  };

  const handleForgotReset = () => {
    const nextErrors = {};

    if (!STRONG_PASSWORD_REGEX.test(forgot.newPassword)) {
      nextErrors.newPassword = "Password must be 8+ chars with upper, lower, number, and symbol.";
    }

    if (forgot.newPassword !== forgot.confirmNewPassword) {
      nextErrors.confirmNewPassword = "Passwords do not match.";
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    const users = getUsers();
    const nextUsers = users.map((user) => {
      if (user.email.toLowerCase() === forgotEmailLocked.toLowerCase()) {
        return {
          ...user,
          password: forgot.newPassword
        };
      }
      return user;
    });

    setUsers(nextUsers);
    setAuthStep("signin");
    setMode("signin");
    setForm((prev) => ({ ...prev, email: forgotEmailLocked, password: "", confirmPassword: "" }));
    setForgot({
      email: "",
      name: "",
      department: "Electricity",
      newPassword: "",
      confirmNewPassword: ""
    });
    setForgotEmailLocked("");
    setErrors({});
    setMessage("Password reset successful. Please sign in with your new password.");
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (authStep === "forgot-verify") {
      handleForgotVerification();
      return;
    }

    if (authStep === "forgot-reset") {
      handleForgotReset();
      return;
    }

    if (mode === "signup") {
      handleSignUp();
      return;
    }
    handleSignIn();
  };

  return (
    <div className="auth-shell">
      <Link to="/" className="auth-screen-back">Back</Link>

      <div className="auth-hero">
        <h1>UtilityTrack</h1>
        <p>Secure utility operations with smart billing, meter tracking, and payment workflows.</p>
      </div>

      <form className="auth-card" onSubmit={handleSubmit} autoComplete="off">
        {authStep === "signin" && (
          <div className="auth-tabs">
            <button
              type="button"
              className={mode === "signin" ? "auth-tab auth-tab-active" : "auth-tab"}
              onClick={() => {
                setMode("signin");
                setShowConfirmPassword(false);
                setErrors({});
                setMessage("");
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={mode === "signup" ? "auth-tab auth-tab-active" : "auth-tab"}
              onClick={() => {
                setMode("signup");
                setErrors({});
                setMessage("");
              }}
            >
              Sign Up
            </button>
          </div>
        )}

        {authStep !== "signin" && (
          <div className="auth-forgot-head">
            <h3>Reset Password</h3>
            <button
              type="button"
              className="auth-back-inline"
              onClick={() => {
                setAuthStep("signin");
                setErrors({});
                setMessage("");
              }}
            >
              Back to Sign In
            </button>
          </div>
        )}

        {authStep === "forgot-verify" && (
          <>
            <p className="auth-helper">Verify your account details before creating a new password.</p>

            <div className="auth-field-wrap">
              <label>Registered Email</label>
              <input
                type="email"
                value={forgot.email}
                onChange={(e) => updateForgotField("email", e.target.value)}
                placeholder="name@example.com"
              />
              {errors.email && <small className="auth-error">{errors.email}</small>}
            </div>

            <div className="auth-field-wrap">
              <label>Registered Full Name</label>
              <input
                value={forgot.name}
                onChange={(e) => updateForgotField("name", e.target.value)}
                placeholder="Enter registered name"
              />
              {errors.name && <small className="auth-error">{errors.name}</small>}
            </div>

            <div className="auth-field-wrap">
              <label>Department</label>
              <select
                value={forgot.department}
                onChange={(e) => updateForgotField("department", e.target.value)}
              >
                {DEPARTMENTS.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
              {errors.department && <small className="auth-error">{errors.department}</small>}
            </div>
          </>
        )}

        {authStep === "forgot-reset" && (
          <>
            <p className="auth-helper">
              Verified account: <strong>{forgotEmailLocked}</strong>
            </p>

            <div className="auth-field-wrap">
              <label>New Password</label>
              <div className="auth-password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  value={forgot.newPassword}
                  onChange={(e) => updateForgotField("newPassword", e.target.value)}
                  placeholder="Create new password"
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  &#128065;
                </button>
              </div>
              {errors.newPassword && <small className="auth-error">{errors.newPassword}</small>}
            </div>

            <div className="auth-field-wrap">
              <label>Confirm New Password</label>
              <div className="auth-password-wrap">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={forgot.confirmNewPassword}
                  onChange={(e) => updateForgotField("confirmNewPassword", e.target.value)}
                  placeholder="Re-enter new password"
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  title={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                >
                  &#128065;
                </button>
              </div>
              {errors.confirmNewPassword && <small className="auth-error">{errors.confirmNewPassword}</small>}
            </div>
          </>
        )}

        {authStep === "signin" && mode === "signup" && (
          <div className="auth-field-wrap">
            <label>Name</label>
            <input
              autoComplete="off"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Enter your full name"
            />
            {errors.name && <small className="auth-error">{errors.name}</small>}
          </div>
        )}

        {authStep === "signin" && <div className="auth-field-wrap">
          <label>Email</label>
          <input
            type="email"
            autoComplete="off"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            onBlur={handleEmailBlur}
            placeholder="name@example.com"
          />
          {errors.email && <small className="auth-error">{errors.email}</small>}
        </div>}

        {authStep === "signin" && (
          <div className="auth-field-wrap">
            <label>Department</label>
            <select
              value={form.department}
              onChange={(e) => updateField("department", e.target.value)}
            >
              {DEPARTMENTS.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
            {errors.department && <small className="auth-error">{errors.department}</small>}
          </div>
        )}

        {authStep === "signin" && <div className="auth-field-wrap">
          <label>Password</label>
          <div className="auth-password-wrap">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => updateField("password", e.target.value)}
              placeholder="Enter password"
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              &#128065;
            </button>
          </div>
          {errors.password && <small className="auth-error">{errors.password}</small>}
        </div>}

        {authStep === "signin" && mode === "signup" && (
          <div className="auth-field-wrap">
            <label>Confirm Password</label>
            <div className="auth-password-wrap">
              <input
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(e) => updateField("confirmPassword", e.target.value)}
                placeholder="Re-enter password"
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                title={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              >
                &#128065;
              </button>
            </div>
            {errors.confirmPassword && <small className="auth-error">{errors.confirmPassword}</small>}
          </div>
        )}

        {authStep === "signin" && mode === "signin" && (
          <button type="button" className="auth-link-btn" onClick={openForgotPassword}>
            Forgot Password?
          </button>
        )}

        {message && <p className="auth-message">{message}</p>}

        <button type="submit" className="auth-submit">
          {authStep === "forgot-verify"
            ? "Verify Account"
            : authStep === "forgot-reset"
              ? "Reset Password"
              : mode === "signup"
                ? "Create Account"
                : "Login"}
        </button>
      </form>
    </div>
  );
}

export default AuthPage;
