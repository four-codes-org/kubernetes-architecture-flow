import React from "react";
import "./GetData.css";
class GetData extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      items: [],
    };
  }
  componentWillMount() {
    setInterval(() => {
      fetch("http://localhost:4000/events/")
        .then((res) => res.json())
        .then((json) => {
          this.setState({
            items: json,
          });
        });
    }, 500);
  }
  render() {
    const { items } = this.state;
    return (
      <div className="events">
        <table className="event_details">
          <tr>
            <th>UUID</th>
            <th>CREATED_TIME</th>
            <th>DETAILS</th>
            
          </tr>
          {items.map((item) => {
            return (
              <tr key={item.uuid}>
              
                <td>{item.uuid}</td>
                <td>{item.createdAt}</td>
                {/* <td>{JSON.stringify(item.event_details.POD)}</td>
                <td>{JSON.stringify(item.event_details.POD_IP)}</td>
                <td>{JSON.stringify(item.event_details.STATUS)}</td>
                <td>{JSON.stringify(item.event_details.NAMESPACE)}</td> */}
                {/* <td>
                  {JSON.stringify(item.event_details.RUNNING_POD_HOSTNAME)}
                </td> */}

                <td>{JSON.stringify(item.event_details)}</td>
                
              </tr>
            );
          })}
        </table>
      </div>
    );
  }
}

export default GetData;
