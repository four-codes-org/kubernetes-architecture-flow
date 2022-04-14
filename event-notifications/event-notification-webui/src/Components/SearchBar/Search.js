import React from "react";
import "./Search.css"

const SearchBar = () => (
  <form action="/" method="get" className="Search">
    <input
      type="text"
      id="header_search"
      placeholder="Search for related details"
      name="s"
    />
    <button type="submit">Search</button>
  </form>
);

export default SearchBar;
