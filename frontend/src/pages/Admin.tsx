import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Trash2, Edit2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

interface User {
  username: string;
  role: string;
  created_at: string;
  is_active: boolean;
  plain_password?: string;
}

export const AdminPage: React.FC = () => {
  const { username, role, token } = useAuth();
  const navigate = useNavigate();
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState('user');
  const [showPassword, setShowPassword] = useState(false);
  const [lastCreatedPassword, setLastCreatedPassword] = useState('');
  const [showCreatedPassword, setShowCreatedPassword] = useState(false);

  // Check if user is admin
  useEffect(() => {
    if (role !== 'admin') {
      navigate('/');
    }
  }, [role, navigate]);

  // Load users
  useEffect(() => {
    loadUsers();
  }, [token]);

  const loadUsers = async () => {
    try {
      const response = await fetch('http://localhost:8015/datawaverapi/auth/users', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load users');
      }

      const data = await response.json();
      setUsers(data);
    } catch (err) {
      setError('Failed to load users');
      console.error(err);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:8015/datawaverapi/auth/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          role: newRole,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to create user');
      }

      setSuccess(`User ${newUsername} created successfully`);
      setLastCreatedPassword(newPassword);
      setShowCreatedPassword(true);
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userToDelete: string) => {
    if (!confirm(`Are you sure you want to delete user "${userToDelete}"?`)) {
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch(`http://localhost:8015/datawaverapi/auth/users/${userToDelete}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to delete user');
      }

      setSuccess(`User ${userToDelete} deleted successfully`);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user.username);
    setEditUsername(user.username);
    setEditPassword('');
    setEditRole(user.role);
    setShowPassword(false);
  };

  const handleSaveEdit = async (userToEdit: string) => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch(`http://localhost:8015/datawaverapi/auth/users/${userToEdit}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          new_username: editUsername !== userToEdit ? editUsername : undefined,
          password: editPassword || undefined,
          role: editRole,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to update user');
      }

      setSuccess(`User ${userToEdit} updated successfully`);
      setEditingUser(null);
      setEditUsername('');
      setEditPassword('');
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8" style={{ backgroundColor: '#0F172A' }}>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
          <p className="text-slate-400 mt-2">Logged in as: <strong>{username}</strong> ({role})</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Create User Form */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Create New User</CardTitle>
              <CardDescription className="text-slate-400">Add a new user to the system</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateUser} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {success && (
                  <Alert className="bg-green-900 border-green-700">
                    <AlertDescription className="text-green-200">{success}</AlertDescription>
                    {showCreatedPassword && (
                      <div className="mt-2 p-2 bg-green-800 rounded text-sm">
                        <p className="text-green-100 mb-1">User password:</p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-green-200 font-mono break-all">{lastCreatedPassword}</code>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(lastCreatedPassword);
                            }}
                            className="px-2 py-1 bg-green-700 hover:bg-green-600 rounded text-xs text-white"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    )}
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="username" className="text-white">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Enter username"
                    required
                    disabled={loading}
                    className="bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-white">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                    disabled={loading}
                    className="bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role" className="text-white">Role</Label>
                  <Select value={newRole} onValueChange={setNewRole} disabled={loading}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
                  {loading ? 'Creating...' : 'Create User'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Users List */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Users</CardTitle>
              <CardDescription className="text-slate-400">All system users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700">
                      <TableHead className="text-slate-300">Username</TableHead>
                      <TableHead className="text-slate-300">Password</TableHead>
                      <TableHead className="text-slate-300">Role</TableHead>
                      <TableHead className="text-slate-300">Created</TableHead>
                      <TableHead className="text-slate-300">Active</TableHead>
                      <TableHead className="text-slate-300">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <React.Fragment key={user.username}>
                        <TableRow className="border-slate-700">
                          <TableCell className="font-medium text-white">{user.username}</TableCell>
                          <TableCell className="text-sm text-slate-400">
                            {user.plain_password ? (
                              <div className="flex items-center gap-2">
                                <code className="text-slate-300 font-mono">{'•'.repeat(8)}</code>
                                <span className="text-xs text-slate-500">(visible after creation)</span>
                              </div>
                            ) : (
                              <span className="text-slate-500 text-xs">••••••••</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded text-sm ${
                              user.role === 'admin' 
                                ? 'bg-red-900 text-red-200' 
                                : 'bg-blue-900 text-blue-200'
                            }`}>
                              {user.role}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-slate-400">
                            {new Date(user.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <span className={user.is_active ? 'text-green-400' : 'text-red-400'}>
                              {user.is_active ? '✓' : '✗'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEditUser(user)}
                                disabled={loading}
                                className="p-1 rounded hover:bg-slate-700 transition-colors disabled:opacity-50"
                                title="Edit user"
                              >
                                <Edit2 size={14} className="text-blue-400" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user.username)}
                                disabled={loading}
                                className="p-1 rounded hover:bg-slate-700 transition-colors disabled:opacity-50"
                                title="Delete user"
                              >
                                <Trash2 size={14} className="text-red-400" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Edit form */}
                        {editingUser === user.username && (
                          <TableRow className="border-slate-700 bg-slate-800/50">
                            <TableCell colSpan={6}>
                              <div className="p-4 space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <div className="space-y-2">
                                    <Label className="text-white text-xs">Username</Label>
                                    <Input
                                      type="text"
                                      value={editUsername}
                                      onChange={(e) => setEditUsername(e.target.value)}
                                      placeholder="New username"
                                      className="bg-slate-700 border-slate-600 text-white placeholder-slate-500 h-8 text-xs"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-white text-xs">New Password (optional)</Label>
                                    <div className="flex gap-1">
                                      <Input
                                        type={showPassword ? "text" : "password"}
                                        value={editPassword}
                                        onChange={(e) => setEditPassword(e.target.value)}
                                        placeholder="Leave blank to keep current"
                                        className="bg-slate-700 border-slate-600 text-white placeholder-slate-500 h-8 text-xs flex-1"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="px-2 py-1 bg-slate-600 hover:bg-slate-500 rounded text-xs text-white"
                                      >
                                        {showPassword ? '👁️' : '👁️‍🗨️'}
                                      </button>
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-white text-xs">Role</Label>
                                    <Select value={editRole} onValueChange={setEditRole}>
                                      <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent className="bg-slate-700 border-slate-600">
                                        <SelectItem value="user">User</SelectItem>
                                        <SelectItem value="admin">Admin</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                <div className="flex items-end gap-2">
                                  <Button
                                    onClick={() => handleSaveEdit(user.username)}
                                    disabled={loading}
                                    className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs"
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    onClick={() => setEditingUser(null)}
                                    disabled={loading}
                                    variant="outline"
                                    className="border-slate-600 text-slate-300 h-8 text-xs"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
