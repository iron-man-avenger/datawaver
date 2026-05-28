import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Trash2, Edit2, Plus, Copy, Check } from 'lucide-react';
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
  history_access: boolean;
}

export const AdminPage: React.FC = () => {
  const { username, role, token } = useAuth();
  const navigate = useNavigate();
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [newHistoryAccess, setNewHistoryAccess] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState('user');
  const [editHistoryAccess, setEditHistoryAccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [lastCreatedPassword, setLastCreatedPassword] = useState('');
  const [lastCreatedUsername, setLastCreatedUsername] = useState('');
  const [showCreatedPassword, setShowCreatedPassword] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [bothCopied, setBothCopied] = useState(false);

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
      const response = await fetch('http://10.200.7.77:8015/datawaverapi/auth/users', {
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
      const response = await fetch('http://10.200.7.77:8015/datawaverapi/auth/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          role: newRole,
          history_access: newHistoryAccess,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to create user');
      }

      setSuccess(`User ${newUsername} created successfully`);
      setLastCreatedPassword(newPassword);
      setLastCreatedUsername(newUsername);
      setShowCreatedPassword(true);
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      setNewHistoryAccess(false);
      loadUsers();
      // Keep modal open to show success, user will close it
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userToDeleteConfirm: string) => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch(`http://10.200.7.77:8015/datawaverapi/auth/users/${userToDeleteConfirm}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to delete user');
      }

      setSuccess(`User ${userToDeleteConfirm} deleted successfully`);
      setShowDeleteConfirm(false);
      setUserToDelete(null);
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
    setEditHistoryAccess(user.history_access);
    setShowPassword(false);
    setShowEditModal(true);
  };

  const handleSaveEdit = async (userToEdit: string) => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch(`http://10.200.7.77:8015/datawaverapi/auth/users/${userToEdit}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          new_username: editUsername !== userToEdit ? editUsername : undefined,
          password: editPassword || undefined,
          role: editRole,
          history_access: editHistoryAccess,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to update user');
      }

      setSuccess(`User ${userToEdit} updated successfully`);
      setShowEditModal(false);
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

  // Handle password copy
  const handleCopyPassword = () => {
    navigator.clipboard.writeText(lastCreatedPassword);
    setPasswordCopied(true);
    setTimeout(() => setPasswordCopied(false), 2000);
  };

  // Handle copy both username and password
  const handleCopyBoth = () => {
    const bothText = `Username: ${lastCreatedUsername}\nPassword: ${lastCreatedPassword}`;
    navigator.clipboard.writeText(bothText);
    setBothCopied(true);
    setTimeout(() => setBothCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header Section */}
      <div className="border-b border-zinc-800 bg-zinc-900/40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between gap-6">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white tracking-tight">User Management</h1>
              <p className="text-zinc-400 text-sm mt-2">
                Manage system users and permissions • Logged in as <span className="text-zinc-300 font-medium">{username}</span>
              </p>
            </div>
            <Button
              onClick={() => {
                setError('');
                setSuccess('');
                setNewUsername('');
                setNewPassword('');
                setNewRole('user');
                setNewHistoryAccess(false);
                setShowCreatedPassword(false);
                setLastCreatedUsername('');
                setLastCreatedPassword('');
                setPasswordCopied(false);
                setBothCopied(false);
                setShowCreateModal(true);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2 px-6 h-10 rounded-lg"
            >
              <Plus size={18} />
              Create User
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Global Alerts */}
        {error && (
          <Alert variant="destructive" className="mb-6 bg-red-950/50 border-red-900 rounded-lg">
            <AlertDescription className="text-red-200">{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="mb-6 bg-green-950/50 border-green-900 rounded-lg">
            <AlertDescription className="text-green-200">{success}</AlertDescription>
          </Alert>
        )}
        {success && (success.includes('updated') || success.includes('created')) && (
          <Alert className="mb-4 bg-blue-950/50 border-blue-900 rounded-lg">
            <AlertDescription className="text-blue-200 text-sm">
              💡 Note: If you changed history access permissions, the user must log out and log back in for changes to take effect.
            </AlertDescription>
          </Alert>
        )}

        {/* Users Table Card */}
        <Card className="bg-zinc-900/80 border-zinc-800 rounded-xl overflow-hidden">
          <CardHeader className="border-b border-zinc-800 px-6 py-5">
            <CardTitle className="text-white text-xl">Users</CardTitle>
            <CardDescription className="text-zinc-400 text-sm">
              {users.length} {users.length === 1 ? 'user' : 'users'} in the system
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {users.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-zinc-400">
                <div className="text-center">
                  <p className="text-lg font-medium mb-2">No users yet</p>
                  <p className="text-sm text-zinc-500">Create your first user to get started</p>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-zinc-800 bg-zinc-800/30 hover:bg-zinc-800/30">
                      <TableHead className="text-zinc-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Username</TableHead>
                      <TableHead className="text-zinc-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Role</TableHead>
                      <TableHead className="text-zinc-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">History Access</TableHead>
                      <TableHead className="text-zinc-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Status</TableHead>
                      <TableHead className="text-zinc-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Created</TableHead>
                      <TableHead className="text-zinc-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user, idx) => (
                      <TableRow 
                        key={user.username}
                        className="border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors duration-150"
                      >
                        <TableCell className="px-6 py-4">
                          <div>
                            <p className="font-medium text-white text-sm">{user.username}</p>
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <Badge
                            variant={user.role === 'admin' ? 'secondary' : 'default'}
                            className="text-xs"
                          >
                            {user.role === 'admin' ? '⚙️ Admin' : '👤 User'}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          {user.history_access ? (
                            <Badge variant="secondary" className="text-xs">
                              🔍 History
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              🚫 Restricted
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${user.is_active ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`} />
                            <span className={`text-xs font-medium ${user.is_active ? 'text-green-400' : 'text-zinc-500'}`}>
                              {user.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <span className="text-zinc-400 text-sm">
                            {new Date(user.created_at).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric' 
                            })}
                          </span>
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEditUser(user)}
                              disabled={loading}
                              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Edit user"
                            >
                              <Edit2 size={16} className="text-blue-400" />
                            </button>
                            <button
                              onClick={() => {
                                setUserToDelete(user.username);
                                setShowDeleteConfirm(true);
                              }}
                              disabled={loading}
                              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete user"
                            >
                              <Trash2 size={16} className="text-red-400" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create User Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-xl">Create New User</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Add a new user to the system. They can log in with their username and password.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newUsername" className="text-zinc-300 font-medium text-sm">Username</Label>
              <Input
                id="newUsername"
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="e.g., john.doe"
                required
                disabled={loading}
                className="bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500 rounded-lg h-10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-zinc-300 font-medium text-sm">Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter a secure password"
                required
                disabled={loading}
                className="bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500 rounded-lg h-10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newRole" className="text-zinc-300 font-medium text-sm">Role</Label>
              <Select value={newRole} onValueChange={setNewRole} disabled={loading}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white rounded-lg h-10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700 rounded-lg">
                  <SelectItem value="user" className="text-white">User</SelectItem>
                  <SelectItem value="admin" className="text-white">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300 font-medium text-sm">History Access</Label>
              <div className="flex items-center gap-3 text-sm text-zinc-200">
                <input
                  id="newHistoryAccess"
                  type="checkbox"
                  checked={newHistoryAccess}
                  onChange={(e) => setNewHistoryAccess(e.target.checked)}
                  disabled={loading}
                  className="h-4 w-4 rounded border-zinc-600 text-blue-500 focus:ring-blue-500"
                />
                <label htmlFor="newHistoryAccess">Can access history even when not admin</label>
              </div>
            </div>

            {/* Success State with Credentials Display */}
            {showCreatedPassword && success && (
              <div className="mt-6 space-y-3 p-4 rounded-lg bg-green-950/40 border border-green-900/50">
                <p className="text-green-300 text-sm font-medium">✓ User created successfully!</p>
                
                {/* Username Display */}
                <div className="bg-zinc-900 rounded border border-zinc-700 p-3">
                  <p className="text-zinc-400 text-xs mb-2">Username:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-blue-300 font-mono text-sm break-all">{lastCreatedUsername}</code>
                  </div>
                </div>

                {/* Password Display */}
                <div className="bg-zinc-900 rounded border border-zinc-700 p-3">
                  <p className="text-zinc-400 text-xs mb-2">Password:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-green-300 font-mono text-sm break-all">{lastCreatedPassword}</code>
                    <button
                      type="button"
                      onClick={handleCopyPassword}
                      className="p-1.5 rounded hover:bg-zinc-800 transition-colors"
                      title="Copy password"
                    >
                      {passwordCopied ? (
                        <Check size={16} className="text-green-400" />
                      ) : (
                        <Copy size={16} className="text-zinc-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Copy Both Button */}
                <button
                  type="button"
                  onClick={handleCopyBoth}
                  className="w-full px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  title="Copy both username and password"
                >
                  {bothCopied ? (
                    <>
                      <Check size={16} className="text-green-300" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={16} />
                      Copy Both
                    </>
                  )}
                </button>
              </div>
            )}

            {error && (
              <Alert variant="destructive" className="bg-red-950/50 border-red-900/50 rounded-lg">
                <AlertDescription className="text-red-200 text-sm">{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg h-10"
              >
                {loading ? 'Creating...' : 'Create User'}
              </Button>
              <Button
                type="button"
                onClick={() => setShowCreateModal(false)}
                disabled={loading}
                variant="outline"
                className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-lg h-10"
              >
                Close
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-xl">Edit User</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Update user details. Leave password blank to keep current.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => {
            e.preventDefault();
            if (editingUser) {
              handleSaveEdit(editingUser);
            }
          }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editUsername" className="text-zinc-300 font-medium text-sm">Username</Label>
              <Input
                id="editUsername"
                type="text"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                placeholder="Username"
                disabled={loading}
                className="bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500 rounded-lg h-10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="editPassword" className="text-zinc-300 font-medium text-sm">New Password (optional)</Label>
              <div className="flex gap-2">
                <Input
                  id="editPassword"
                  type={showPassword ? "text" : "password"}
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                  disabled={loading}
                  className="bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500 rounded-lg h-10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 flex-1"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors"
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="editRole" className="text-zinc-300 font-medium text-sm">Role</Label>
              <Select value={editRole} onValueChange={setEditRole} disabled={loading}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white rounded-lg h-10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700 rounded-lg">
                  <SelectItem value="user" className="text-white">User</SelectItem>
                  <SelectItem value="admin" className="text-white">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300 font-medium text-sm">History Access</Label>
              <div className="flex items-center gap-3 text-sm text-zinc-200">
                <input
                  id="editHistoryAccess"
                  type="checkbox"
                  checked={editHistoryAccess}
                  onChange={(e) => setEditHistoryAccess(e.target.checked)}
                  disabled={loading}
                  className="h-4 w-4 rounded border-zinc-600 text-blue-500 focus:ring-blue-500"
                />
                <label htmlFor="editHistoryAccess">Can access history even when not admin</label>
              </div>
            </div>

            {error && (
              <Alert variant="destructive" className="bg-red-950/50 border-red-900/50 rounded-lg">
                <AlertDescription className="text-red-200 text-sm">{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg h-10"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                type="button"
                onClick={() => setShowEditModal(false)}
                disabled={loading}
                variant="outline"
                className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-lg h-10"
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800 rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white text-lg">Delete User</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete <span className="font-semibold text-zinc-300">{userToDelete}</span>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end pt-2">
            <AlertDialogCancel className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-lg">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (userToDelete) {
                  handleDeleteUser(userToDelete);
                }
              }}
              disabled={loading}
              className="bg-red-600 hover:bg-red-700 text-white rounded-lg"
            >
              {loading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
