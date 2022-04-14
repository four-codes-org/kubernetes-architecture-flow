import "./App.css";
import Header from "./Components/Header/Header";
import SearchBar from "./Components/SearchBar/Search";

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <Header />
        <SearchBar />
      </header>
    </div>
  );
}

export default App;
