export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="status-card">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return <div className="error-card">{message}</div>;
}
