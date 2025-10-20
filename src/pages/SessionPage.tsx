import { useParams } from 'react-router-dom';

export const SessionPage = () => {
  const { roomId } = useParams<{ roomId: string }>();

  return (
    <main>
      <h1>Session</h1>
      <p>{roomId ? `Connected to room ${roomId}` : 'No room selected yet.'}</p>
    </main>
  );
};

SessionPage.displayName = 'SessionPage';

export default SessionPage;
