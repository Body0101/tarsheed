export const handleGitHubPagesRedirect = () => {
  const redirect = sessionStorage.getItem("redirect");

  if (redirect) {
    sessionStorage.removeItem("redirect");

    // Replace URL without reloading
    window.history.replaceState(null, "", redirect);
  }
};
