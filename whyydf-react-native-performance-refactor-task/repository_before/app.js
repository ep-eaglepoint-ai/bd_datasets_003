import React, { Component } from "react";
import {
  View,
  Text,
  Button,
  TextInput,
  StyleSheet,
  ScrollView,
} from "react-native";

export default class Contacts extends Component {
  constructor(props) {
    super(props);

    this.state = {
      contacts: [
        { id: 1, name: "Alice", favorite: true },
        { id: 2, name: "Bob", favorite: false },
        { id: 3, name: "Charlie", favorite: false },
        { id: 4, name: "Diana", favorite: true },
      ],
      filter: "",
      lastToggledId: null,
      initialized: false,
    };

    this.toggleFavorite = this.toggleFavorite.bind(this);
    this.handleFilterChange = this.handleFilterChange.bind(this);
  }

  componentDidMount() {
    // Simulate legacy initialization logic
    this.setState({ initialized: true });
  }

  componentDidUpdate(prevProps, prevState) {
    // Legacy side-effect that depends on previous state
    if (
      prevState.lastToggledId !== this.state.lastToggledId &&
      this.state.lastToggledId !== null
    ) {
      console.log(
        "Favorite toggled for contact:",
        this.state.lastToggledId
      );
    }
  }

  handleFilterChange(text) {
    this.setState({ filter: text });
  }

  toggleFavorite(id) {
    const updatedContacts = [];

    for (let i = 0; i < this.state.contacts.length; i++) {
      const contact = this.state.contacts[i];

      if (contact.id === id) {
        updatedContacts.push({
          id: contact.id,
          name: contact.name,
          favorite: !contact.favorite,
        });
      } else {
        updatedContacts.push(contact);
      }
    }

    this.setState({
      contacts: updatedContacts,
      lastToggledId: id,
    });
  }

  getFilteredContacts() {
    const { contacts, filter } = this.state;

    if (!filter || filter.trim() === "") {
      return contacts;
    }

    const lower = filter.toLowerCase();
    const result = [];

    contacts.forEach((c) => {
      if (c.name.toLowerCase().indexOf(lower) !== -1) {
        result.push(c);
      }
    });

    return result;
  }

  renderContact(contact) {
    return (
      <View key={contact.id} style={styles.contactRow}>
        <Text style={styles.contactName}>{contact.name}</Text>
        <Button
          title={contact.favorite ? "Unfavorite" : "Favorite"}
          onPress={() => this.toggleFavorite(contact.id)}
        />
      </View>
    );
  }

  render() {
    const { filter, initialized } = this.state;

    if (!initialized) {
      return (
        <View style={styles.container}>
          <Text>Loading contacts...</Text>
        </View>
      );
    }

    const filteredContacts = this.getFilteredContacts();

    return (
      <View style={styles.container}>
        <TextInput
          style={styles.input}
          value={filter}
          placeholder="Search contacts"
          onChangeText={this.handleFilterChange}
        />

        <ScrollView>
          {filteredContacts.map((contact) =>
            this.renderContact(contact)
          )}
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    marginBottom: 12,
    padding: 8,
  },
  contactRow: {
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  contactName: {
    fontSize: 16,
  },
});
