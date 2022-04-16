import React, { useEffect, useState } from "react";
import "./GetData.css";

function GetData() {
  const [data, getData] = useState([]);
  const URL = "http://localhost:4000/events/";

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = () => {
    fetch(URL)
      .then((res) => res.json())
      .then((response) => {
        // var results = JSON.stringify(response, undefined, 2);
        // var results2 = results.replace(/[ ]/g, "&nbsp;");
        // console.log(results);
        // console.log(results2)
        getData(response);
        console.log(response);
      });
  };

  return (
    <div className="events">
      <table>
        <tr>
          <th>UUID</th>
          <th>CREATED_TIME</th>
          <th>DETAILS</th>
        </tr>
        {data.map((item, i) => (
          <tr key={i}>
            <td>{item.uuid}</td>
            <td>{item.createdAt}</td>
            <td className="q">{JSON.stringify(item.event_details)}</td>
          </tr>
        ))}
      </table>
    </div>
  );
}

export default GetData;
