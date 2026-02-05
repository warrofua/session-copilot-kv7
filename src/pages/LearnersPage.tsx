import { useEffect, useState } from 'react';
import type { Learner } from '../db/db';
import { useAuth } from '../contexts/AuthContext';
import { learnerService } from '../services/learnerService';
import { useNavigate } from 'react-router-dom';
import { LearnerModal } from '../components/LearnerModal';

export default function LearnersPage() {
    const { user: currentUser } = useAuth();
    const navigate = useNavigate();
    const [learners, setLearners] = useState<Learner[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);

    useEffect(() => {
        if (!currentUser) {
            navigate('/login');
            return;
        }
        loadLearners();
    }, [currentUser, navigate]);

    async function loadLearners() {
        try {
            setIsLoading(true);
            const data = await learnerService.getLearners();
            setLearners(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load learners');
        } finally {
            setIsLoading(false);
        }
    }

    if (isLoading) return <div className="p-8 text-center text-gray-500">Loading learners...</div>;

    const canManage = currentUser?.role === 'manager' || currentUser?.role === 'bcba';

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
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Learners (Caseload)</h1>
                    <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                        A list of all learners in your organization.
                    </p>
                </div>
                {canManage && (
                    <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
                        <button
                            type="button"
                            onClick={() => setShowAddModal(true)}
                            className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
                        >
                            Add Learner
                        </button>
                    </div>
                )}
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
                                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">DOB</th>
                                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Status</th>
                                        <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                                            <span className="sr-only">Edit</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                                    {learners.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="py-4 text-center text-sm text-gray-500">No learners found.</td>
                                        </tr>
                                    ) : (
                                        learners.map((learner) => (
                                            <tr key={learner.id}>
                                                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-gray-100 sm:pl-6">{learner.name}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">{new Date(learner.dob).toLocaleDateString()}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                                                    <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 
                                                        ${learner.status === 'active' ? 'bg-green-100 text-green-800' :
                                                            learner.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                                                                'bg-red-100 text-red-800'}`}>
                                                        {learner.status.charAt(0).toUpperCase() + learner.status.slice(1)}
                                                    </span>
                                                </td>
                                                <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                                    <a href="#" className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300">Edit</a>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <LearnerModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onLearnerAdded={loadLearners}
            />
        </div>
    );
}
