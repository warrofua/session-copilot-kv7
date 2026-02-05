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
    updateLearner: (data: UpdateLearnerRequest) => Promise<Learner>;
}

export interface UpdateLearnerRequest {
    id: string;
    name?: string;
    dob?: string;
    status?: 'active' | 'inactive' | 'discharged';
}

const API_Base = '/api';

export const learnerService: LearnerService = {
    getLearners: async () => {
        const response = await fetch(`${API_Base}/learners`, {
            credentials: 'include' // Important: send HttpOnly cookies
        });

        if (!response.ok) {
            throw new Error('Failed to fetch learners');
        }

        return response.json();
    },

    createLearner: async (learnerData: CreateLearnerRequest) => {
        const response = await fetch(`${API_Base}/learners`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // Important: send HttpOnly cookies
            body: JSON.stringify(learnerData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create learner');
        }

        return response.json();
    },

    updateLearner: async (learnerData: UpdateLearnerRequest) => {
        const response = await fetch(`${API_Base}/learners`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(learnerData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update learner');
        }

        return response.json();
    }
};
