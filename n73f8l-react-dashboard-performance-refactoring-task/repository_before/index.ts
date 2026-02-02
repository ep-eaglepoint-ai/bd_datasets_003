import React, {
  createContext,
  useContext,
  useState,
  useEffect,
} from "react";

type User = {
  id: number;
  name: string;
  active: boolean;
};

type UserContextType = {
  users: User[];
  toggleUser: (id: number) => void;
};

const UserContext = createContext<UserContextType | null>(null);

const UserRow: React.FC<{ user: User }> = ({ user }) => {
  console.log("UserRow render:", user.id);

  return (
    <li>
      <span>{user.name}</span>
      <button>{user.active ? "Deactivate" : "Activate"}</button>
    </li>
  );
};

const UserList: React.FC = () => {
  const { users } = useContext(UserContext)!;

  return (
    <ul>
      {users.map((user) => (
        <UserRow key={user.id} user={user} />
      ))}
    </ul>
  );
};

export default function Dashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setUsers([
      { id: 1, name: "Alice", active: true },
      { id: 2, name: "Bob", active: false },
      { id: 3, name: "Charlie", active: true },
    ]);
  }, []);

  const toggleUser = (id: number) => {
    setUsers(
      users.map((u) =>
        u.id === id ? { ...u, active: !u.active } : u
      )
    );
  };

  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <UserContext.Provider value={{ users: filteredUsers, toggleUser }}>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter users"
      />
      <UserList />
    </UserContext.Provider>
  );
}
