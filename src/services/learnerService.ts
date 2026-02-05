import type { Learner } from '../db/db';

export interface CreateLearnerRequest {
    name: string;
    dob: string;
    status: 'active' | 'inactive' | 'discharged';
    primaryBcbaId?: string;
    assignedRbtIds?: string[];
}

export interface LearnerService {
    getLearners: () => Promise<Learner[]>;
    createLearner: (data: CreateLearnerRequest) => Promise<Learner>;
}

const API_Base = '/api';

export const learnerService: LearnerService = {
    getLearners: async () => {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_Base}/learners`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch learners');
        }

        return response.json();
    },

    createLearner: async (learnerData: CreateLearnerRequest) => {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_Base}/learners`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(learnerData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create learner');
        }

        return response.json();
    }
};
