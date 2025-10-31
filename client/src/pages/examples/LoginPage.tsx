import LoginPage from "../LoginPage";

export default function LoginPageExample() {
  return (
    <LoginPage
      onLogin={(email, password) => {
        console.log("Login attempt:", { email, password });
        alert(`Login attempt with: ${email}`);
      }}
    />
  );
}
