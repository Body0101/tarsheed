export const useToast = () => {
  const showToast = (message, type = "info") => {
    const prefix = type.toUpperCase();
    console.log(`[${prefix}] ${message}`);
  };

  return { showToast };
};
