import { useEffect, useState } from 'react';
import type { User } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/userService';
import { useNavigate } from 'react-router-dom';
import { UserModal } from '../components/UserModal';

export default function UsersPage() {
    const { user: currentUser, isLoading: isAuthLoading } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);

    useEffect(() => {
        if (isAuthLoading) {
            return;
        }
        if (!currentUser || currentUser.role !== 'manager') {
            navigate('/app');
            return;
        }
        loadUsers();
    }, [currentUser, isAuthLoading, navigate]);

    async function loadUsers() {
        try {
            setIsLoading(true);
            const data = await userService.getUsers();
            setUsers(data);
        } catch (err) {
            setError('Failed to load users');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }

    if (isAuthLoading || isLoading) return <div className="p-8 text-center">Loading users...</div>;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="sm:flex sm:items-center">
                <div className="sm:flex-auto">
                    <button
                        onClick={() => navigate('/app')}
                        className="mb-4 inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        ← Back to Session
                    </button>
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Users</h1>
                    <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                        A list of all users in your organization including their name, role, and email.
                    </p>
                </div>
                <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
                    <button
                        type="button"
                        onClick={() => setShowAddModal(true)}
                        className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
                    >
                        Add user
                    </button>
                </div>
            </div>

            {error && (
                <div className="mt-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                    {error}
                </div>
            )}

            <div className="mt-8 flex flex-col">
                <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
                    <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
                        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                            <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-800">
                                    <tr>
                                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 sm:pl-6">Name</th>
                                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Role</th>
                                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Email</th>
                                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Status</th>
                                        <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                                            <span className="sr-only">Edit</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                                    {users.map((person) => (
                                        <tr key={person.email}>
                                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-gray-100 sm:pl-6">{person.name}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400 capitalize">{person.role}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">{person.email}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                                                <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${person.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                    {person.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                                <a href="#" className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300">Edit<span className="sr-only">, {person.name}</span></a>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            {/* Modal placeholder */}
            {showAddModal && (
                <UserModal
                    isOpen={showAddModal}
                    onClose={() => setShowAddModal(false)}
                    onUserAdded={loadUsers}
                />
            )}
        </div>
    );
}
