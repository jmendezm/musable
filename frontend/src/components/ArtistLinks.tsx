import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SongArtist } from '../types';

interface ArtistLinksProps {
  artists?: SongArtist[];
  fallbackName?: string;
  className?: string;
}

const ArtistLinks: React.FC<ArtistLinksProps> = ({ artists, fallbackName, className }) => {
  const navigate = useNavigate();

  if (!artists || artists.length === 0) {
    return <span className={className}>{fallbackName || 'Unknown Artist'}</span>;
  }

  return (
    <span className={className}>
      {artists.map((artist, index) => (
        <React.Fragment key={artist.id}>
          {index > 0 && ', '}
          <span
            className="hover:underline cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/artist/${artist.id}`);
            }}
          >
            {artist.name}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
};

export default ArtistLinks;
