import "./App.css";
import Header from "./Components/Header/Header";
import SearchBar from "./Components/SearchBar/Search";
import GetData from "./Components/GetData/GetData";

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <Header />
        <SearchBar />
        <GetData />
      </header>
    </div>
  );
}

export default App;
