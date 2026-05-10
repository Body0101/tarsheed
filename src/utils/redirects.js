export const handleGitHubPagesRedirect = () => {
  const redirect = sessionStorage.getItem("redirect");

  if (redirect) {
    sessionStorage.removeItem("redirect");

    // Replace URL wi thout reloading
    window.history.replaceState(null, "", redirect);
  }
};
