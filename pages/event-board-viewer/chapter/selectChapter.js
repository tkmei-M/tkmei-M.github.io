async function insertChapterSelectTable() {
  try {
    if (!gameCharactersCache) {
      const charactersResponse = await fetch("gameCharacters.json");
      let gameCharactersCache = await charactersResponse.json();
    }
    if (!eventsCache) {
      const eventsResponse = await fetch(
        "https://sekai-world.github.io/sekai-master-db-diff/events.json",
      );
      let eventsCache = await eventsResponse.json();
    }
  } catch (err) {
    console.log("Failed to load static data", err);
  }
}
