import React from 'react';

// The entire game is a standalone canvas experience served from /game/index.html.
// The React app simply mounts it full-screen. This keeps the game engine
// framework-agnostic and lightning-fast (no VDOM overhead in the game loop).
function App() {
  return (
    <iframe
      id="game-frame"
      title="Catch Falling Objects"
      src="/game/index.html"
      allow="autoplay; fullscreen"
      data-testid="game-frame"
    />
  );
}

export default App;
