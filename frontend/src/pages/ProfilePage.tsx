import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { UserIcon, MusicalNoteIcon, RectangleStackIcon } from '@heroicons/react/24/outline';
import { apiService } from '../services/api';
import { User, Playlist } from '../types';
import { getApiBaseUrl } from '../config/config';

const ProfilePage: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) {
      navigate('/');
      return;
    }

    const fetchUserData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch user profile and public playlists in parallel
        const [userResponse, playlistsResponse] = await Promise.all([
          apiService.getUserProfile(username),
          apiService.getUserPublicPlaylists(username)
        ]);

        if (userResponse.success) {
          setUser(userResponse.data.user);
        } else {
          setError('User not found');
        }

        if (playlistsResponse.success) {
          setPlaylists(playlistsResponse.data.playlists);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        setError('Failed to load user profile');
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, [username, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <UserIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">User Not Found</h2>
          <p className="text-gray-400">{error || 'This user does not exist'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Profile Header */}
      <div className="bg-gray-800 rounded-lg p-8 mb-8">
        <div className="flex items-center space-x-6">
          {/* Profile Picture */}
          <div className="flex-shrink-0">
            {user.profile_picture ? (
              <img
                src={`${getApiBaseUrl().replace('/api', '')}${user.profile_picture.startsWith('/') ? '' : '/'}${user.profile_picture}`}
                alt={user.username}
                className="w-32 h-32 rounded-full object-cover border-4 border-primary"
              />
            ) : (
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center border-4 border-primary">
                <UserIcon className="w-16 h-16 text-white" />
              </div>
            )}
          </div>

          {/* User Info */}
          <div className="flex-1">
            <h1 className="text-4xl font-bold text-white mb-2">{user.username}</h1>
            {user.is_admin && (
              <span className="inline-block bg-primary/20 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
                Admin
              </span>
            )}
            <p className="text-gray-400">
              Member since {new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
            </p>
          </div>
        </div>
      </div>

      {/* Public Playlists Section */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
          <MusicalNoteIcon className="w-6 h-6 mr-2 text-primary" />
          Public Playlists
        </h2>

        {playlists.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-12 text-center">
            <RectangleStackIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No Public Playlists</h3>
            <p className="text-gray-400">This user hasn't created any public playlists yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {playlists.map((playlist) => (
              <div
                key={playlist.id}
                onClick={() => navigate(`/playlist/${playlist.id}`)}
                className="bg-gray-800 rounded-lg p-4 hover:bg-gray-700 transition-all cursor-pointer group"
              >
                {/* Playlist Artwork/Icon */}
                <div className="aspect-square bg-gradient-to-br from-primary to-purple-600 rounded-lg mb-4 flex items-center justify-center relative overflow-hidden">
                  <MusicalNoteIcon className="w-16 h-16 text-white opacity-50" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <MusicalNoteIcon className="w-12 h-12 text-white" />
                  </div>
                </div>

                {/* Playlist Info */}
                <h3 className="text-white font-semibold truncate mb-1">{playlist.name}</h3>
                <p className="text-gray-400 text-sm truncate">{playlist.description || 'No description'}</p>

                {/* Playlist Stats */}
                <div className="flex items-center text-gray-500 text-sm mt-2">
                  <MusicalNoteIcon className="w-4 h-4 mr-1" />
                  <span>{playlist.song_count || 0} songs</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
