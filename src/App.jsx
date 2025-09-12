import React, { useState, useEffect, useRef } from 'react';
import { Search, Clock, CheckCircle, ExternalLink, User, Building, Users, Download } from 'lucide-react';
import './App.css'; // Make sure to use the existing CSS file
import { API_ENDPOINTS } from './config';

const ProspectSearch = () => {
  const [criteriaSentence, setCriteriaSentence] = useState('SDE at Zomato');
  const [searchMethod, setSearchMethod] = useState('exa_search');
  const [desiredProfileCount, setDesiredProfileCount] = useState(10);
  const [searchState, setSearchState] = useState('idle'); // idle, searching, processing, completed, error
  const [requestId, setRequestId] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [streamingProfiles, setStreamingProfiles] = useState([]);
  const [newProfilesCount, setNewProfilesCount] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [columnWidths, setColumnWidths] = useState({});
  const [isResizing, setIsResizing] = useState(false);
  const [resizingColumn, setResizingColumn] = useState(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);
  const tableRef = useRef(null);
  const [activeTooltip, setActiveTooltip] = useState(null);

  // Debug logging
  console.log('ProspectSearch component rendered');
  console.log('API_BASE_URL:', API_ENDPOINTS.SEARCH);



  



  const initiateSearch = async () => {
    if (!criteriaSentence.trim()) return;
    
    setSearchState('searching');
    setError('');
    
    try {
      const response = await fetch(API_ENDPOINTS.SEARCH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          criteria_sentence: criteriaSentence.trim(),
          search_method: searchMethod,
          desired_profile_count: desiredProfileCount
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setRequestId(data.request_id);
        setMessage(data.message);
        setSearchState('processing');
        // Start polling for status
        pollStatus(data.request_id);
      } else {
        setError(data.message || 'Search failed');
        setSearchState('error');
      }
    } catch (err) {
      setError('Network error occurred');
      setSearchState('error');
    }
  };

  // Store polling timer reference
  const pollingTimerRef = useRef(null);

  // Clear polling timer when component unmounts or when search is reset
  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
      }
    };
  }, []);
  
  // Column resizing functionality
  const handleResizeStart = useRef((e, columnId) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const table = tableRef.current;
    if (!table) return;
    
    // Get all column widths at the start
    const allColumns = ['name', 'result', 'title'];
    const currentWidths = {};
    allColumns.forEach(col => {
      currentWidths[col] = columnWidths[col] || 
        (document.getElementById(`column-${col}`)?.offsetWidth || 150);
    });
    
    // Get dynamic criteria columns
    const criteriaColumns = Array.from(table.querySelectorAll('th[id^="column-"]'))
      .map(th => th.id.replace('column-', ''))
      .filter(id => !allColumns.includes(id));
    
    criteriaColumns.forEach(col => {
      currentWidths[col] = columnWidths[col] || 150;
    });
    
    const totalWidth = Object.values(currentWidths).reduce((sum, width) => sum + width, 0);
    const startColumnWidth = currentWidths[columnId];
    
    const handleMouseMove = (moveEvent) => {
      moveEvent.preventDefault();
      const diff = moveEvent.clientX - startX;
      const newColumnWidth = Math.max(100, startColumnWidth + diff);
      
      // Calculate how much the column changed
      const widthChange = newColumnWidth - startColumnWidth;
      
      // Find the next column to adjust (or previous if this is the last column)
      const allColumnIds = [...allColumns, ...criteriaColumns];
      const currentIndex = allColumnIds.indexOf(columnId);
      const nextColumnId = allColumnIds[currentIndex + 1] || allColumnIds[currentIndex - 1];
      
      if (nextColumnId) {
        const nextColumnWidth = Math.max(100, currentWidths[nextColumnId] - widthChange);
        
        const newWidths = {
          ...currentWidths,
          [columnId]: newColumnWidth,
          [nextColumnId]: nextColumnWidth
        };
        
        setColumnWidths(newWidths);
      }
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      // Save column widths to localStorage for persistence
      try {
        localStorage.setItem('columnWidths', JSON.stringify(columnWidths));
      } catch (e) {
        console.error('Failed to save column widths to localStorage', e);
      }
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }).current;
  
  // Load saved column widths on component mount
  useEffect(() => {
    try {
      const savedWidths = localStorage.getItem('columnWidths');
      if (savedWidths) {
        setColumnWidths(JSON.parse(savedWidths));
      }
    } catch (e) {
      console.error('Failed to load column widths from localStorage', e);
    }
  }, []);

  const pollStatus = async (id) => {
    // Clear any existing timer before setting a new one
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    
    try {
      // Set up fetch with timeout of 30 seconds
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(API_ENDPOINTS.STATUS(id), {
        signal: controller.signal
      });
      
      // Clear the timeout as the request completed
      clearTimeout(timeoutId);
      
      const data = await response.json();
      
      setMessage(data.message);
      
      // Handle streaming profiles during processing
      if (data.status === 'processing' && data.streamed_profiles) {
        // Merge new streamed profiles with existing ones, avoiding duplicates
        setStreamingProfiles(prevProfiles => {
          const existingUrls = new Set(prevProfiles.map(p => p.url));
          const newProfiles = data.streamed_profiles.filter(profile => !existingUrls.has(profile.url));
          
          // Update new profiles count for visual feedback
          setNewProfilesCount(newProfiles.length);
          
          // Clear the count after 3 seconds
          setTimeout(() => setNewProfilesCount(0), 3000);
          
          return [...prevProfiles, ...newProfiles];
        });
        // Continue polling every 5 seconds
        pollingTimerRef.current = setTimeout(() => pollStatus(id), 3000);
      } else if (data.status === 'processing' && data.profiles?.results?.selected_profiles && data.profiles.results.selected_profiles.length > 0) {
        // If we get selected_profiles during processing, switch to showing only those
        console.log('Found selected_profiles during processing, switching to completed state', data.profiles.results.selected_profiles);
        setStreamingProfiles([]);
        setNewProfilesCount(0);
        setSearchResults(data);
        setSearchState('completed');
      } else if (data.status === 'completed') {
        // Clear streaming profiles and set final results
        setStreamingProfiles([]);
        setNewProfilesCount(0);
        setSearchResults(data);
        setSearchState('completed');
      } else if (data.status === 'failed') {
        setError(data.message || 'Search failed');
        setSearchState('error');
      } else if (data.status === 'processing') {
        // Continue polling every 5 seconds, but store the timer reference
        pollingTimerRef.current = setTimeout(() => pollStatus(id), 3000);
      }
    } catch (err) {
      // Handle timeout errors specifically
      if (err.name === 'AbortError') {
        setError('Status API request timed out. The server might be busy.');
      } else {
        setError('Failed to check status: ' + err.message);
      }
      setSearchState('error');
    }
  };

  const resetSearch = () => {
    // Clear any existing polling timer when resetting search
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    
    setSearchState('idle');
    setRequestId('');
    setSearchResults(null);
    setStreamingProfiles([]);
    setNewProfilesCount(0);
    setMessage('');
    setError('');
    setActiveTooltip(null);
  };

  const extractDomain = (url) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  // Function to export search results to CSV
  const exportToCSV = () => {
    if (!searchResults || !searchResults.profiles || !searchResults.profiles.results) {
      return;
    }

    // Get profiles from search results
    const profiles = searchResults.profiles.results.selected_profiles || [];
    
    // Create CSV header
    const csvHeader = [
      'Name',
      'Title',
      'Company',
      'URL',
      'All Criteria Met',
      'Search Term',
      'Reason'
    ];

    // Add any match criteria as columns
    const allMatchCriteria = new Set();
    profiles.forEach(profile => {
      const criteriaResults = parseCriteriaResults(profile);
      Object.keys(criteriaResults).forEach(key => allMatchCriteria.add(key));
    });
    
    const matchCriteriaArray = Array.from(allMatchCriteria);
    const fullHeader = [...csvHeader, ...matchCriteriaArray.map(c => `${c} Match`)]; 
    
    // Create CSV rows
    const csvRows = profiles.map(profile => {
      // Parse criteria results data
      const criteriaResults = parseCriteriaResults(profile);
      
      // Basic profile data
      const row = [
        `"${profile.first_name || ''} ${profile.last_name || ''}"`,
        `"${profile.title || ''}"`,
        `"${profile.company || ''}"`,
        `"${profile.url || ''}"`,
        profile.all_criteria_met === true ? 'Yes' : 'No',
        `"${profile.search_term || ''}"`,
        `"${JSON.stringify(profile.criteria_results || profile.reason || '')}"`
      ];
      
      // Add match criteria data
      matchCriteriaArray.forEach(criteria => {
        row.push(`"${criteriaResults[criteria] || ''}"`);
      });
      
      return row.join(',');
    });
    
    // Combine header and rows
    const csvContent = [
      fullHeader.join(','),
      ...csvRows
    ].join('\n');
    
    // Create and download the CSV file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    // Set file name with date
    const date = new Date().toISOString().split('T')[0];
    const fileName = `prospect_search_${date}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper function to parse criteria results and extract match information
  const parseCriteriaResults = (profile) => {
    if (!profile.criteria_results || !Array.isArray(profile.criteria_results)) {
      // Fallback to old reason format if criteria_results doesn't exist
      if (profile.reason) {
        try {
          const reasonObj = typeof profile.reason === 'string' ? JSON.parse(profile.reason) : profile.reason;
          return reasonObj;
        } catch (e) {
          return {};
        }
      }
      return {};
    }
    
    // Convert criteria_results array to object format for compatibility
    const result = {};
    profile.criteria_results.forEach(criteriaResult => {
      if (criteriaResult.criteria && criteriaResult.result) {
        // Convert result to lowercase for consistency
        let status = criteriaResult.result.toLowerCase();
        
        // Handle "Not Matched" -> "not_matched" conversion
        if (status.includes(' ')) {
          status = status.replace(/ /g, '_');
        }
        
        result[criteriaResult.criteria.toLowerCase()] = status;
      }
    });
    
    return result;
  };

  // Helper function to get reason object for tooltip
  const getCriteriaReason = (profile, criteria) => {
    if (!profile.criteria_results || !Array.isArray(profile.criteria_results)) {
      return null;
    }
    
    const criteriaResult = profile.criteria_results.find(cr => 
      cr.criteria && cr.criteria.toLowerCase() === criteria.toLowerCase()
    );
    
    if (criteriaResult && criteriaResult.reason) {
      return criteriaResult.reason;
    }
    
    return null;
  };

  // Helper function to render profile table
  const renderProfileTable = (profiles, title, icon, colorClass) => {
    if (!profiles || profiles.length === 0) {
      return (
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center gap-3 mb-4">
            {icon}
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>
          <div className="text-center py-8 text-gray-500">
            <Users className="mx-auto text-gray-300 mb-2" size={32} />
            <p>No {title.toLowerCase()} found</p>
          </div>
        </div>
      );
    }

    // Helper function to render match status with tooltip
    const renderMatchStatus = (status, profile = null, criteria = null) => {
      const getStatusContent = () => {
      if (status === 'matched') {
          return (
            <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
              Match
            </span>
          );
      } else if (status === 'not_matched') {
          return (
            <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
              No match
            </span>
          );
      } else if (status === 'not_found') {
          return (
            <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
              Unknown
            </span>
          );
        } else if(status === 'probably_matched') {
          return (
            <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-medium bg-orange-600 text-yellow-200 border border-yellow-200">
              Probably
            </span>
          );
      } else {
          return (
            <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
              other
            </span>
          );
        }
      };

      // If no profile data, return simple status
      if (!profile || !criteria) {
        return getStatusContent();
      }

      // Get reason object for tooltip
      const reason = getCriteriaReason(profile, criteria);
      
      const tooltipId = `tooltip-${profile.url}-${criteria}`.replace(/[^a-zA-Z0-9]/g, '-');
      
      return (
        <div className="relative group inline-block cursor-pointer" onClick={() => setActiveTooltip(activeTooltip === tooltipId ? null : tooltipId)}>
          {getStatusContent()}
          {activeTooltip === tooltipId && (
            <div 
              className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-[999999]" 
              onClick={() => setActiveTooltip(null)}
            >
              <div 
                className="tooltip bg-gray-800 bg-opacity-95 text-white text-sm rounded-lg shadow-lg border border-gray-600 p-4 max-w-md w-full mx-4" 
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-3 border-b border-gray-600 pb-2">
                  <div className="font-bold">{criteria} Details</div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTooltip(null);
                    }}
                    className="text-gray-400 hover:text-white text-lg"
                  >
                    ✕
                  </button>
                </div>
                {reason ? (
                  <div className="whitespace-pre-wrap text-left">
                    <div className="mb-2"><span className="font-bold">Value:</span> {reason.inferred_value || 'Unknown'}</div>
                    <div className="mb-2"><span className="font-bold">Source:</span> {reason.source || 'Unknown'}</div>
                    <div className="mb-2"><span className="font-bold">Reason:</span> {reason.source_reason || 'Unknown'}</div>
                    {reason.thought && <div className="mb-2"><span className="font-bold">Thought:</span> {reason.thought}</div>}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap text-center">No reason data available</div>
                )}
              </div>
            </div>
          )}
        </div>
      );
    };

    // Get unique match criteria from all profiles
    const allMatchCriteria = new Set();
    profiles.forEach(profile => {
      if (profile.criteria_results && Array.isArray(profile.criteria_results)) {
        profile.criteria_results.forEach(cr => {
          if (cr.criteria) {
            allMatchCriteria.add(cr.criteria.toLowerCase());
          }
        });
      } else {
        const criteriaResults = parseCriteriaResults(profile);
        Object.keys(criteriaResults).forEach(key => allMatchCriteria.add(key));
      }
    });

    // Ensure consistent table structure with minimum columns
    let matchCriteriaArray = Array.from(allMatchCriteria);
    
    // If we have very few criteria during streaming, add some default ones to maintain table width
    if (searchState === 'processing' && matchCriteriaArray.length < 2) {
      // Add common criteria that might appear later
      const defaultCriteria = ['position', 'company', 'experience'];
      defaultCriteria.forEach(criteria => {
        if (!matchCriteriaArray.includes(criteria)) {
          matchCriteriaArray.push(criteria);
        }
      });
    }

    return (
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex items-center gap-2 mb-3">
          <User className="text-blue-600" size={18} />
          <h3 className="text-base font-medium text-gray-800">{title}</h3>
          <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">{profiles.length} profiles</span>
        </div>
        
        <div className="table-container" style={{ 
          overflowX: 'auto',
          width: '100%',
          position: 'relative' // Ensure proper stacking context
        }}>
          <table ref={tableRef} className="excel-table" style={{ 
            minWidth: searchState === 'processing' ? '1000px' : 'auto',
            position: 'relative', // Ensure proper stacking context
            zIndex: 1 // Lower z-index than tooltips
          }}>
            <thead>
              <tr className="excel-header">
                <th 
                  id="column-serial" 
                  className="fixed-column-header resizable-column"
                  style={{ width: columnWidths['serial'] || 50 }}
                >
                  #
                  <div 
                    className="resizer" 
                    onMouseDown={(e) => handleResizeStart(e, 'serial')}
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      handleResizeStart({...e, clientX: touch.clientX}, 'serial');
                    }}
                  />
                </th>
                <th 
                  id="column-photo" 
                  className="fixed-column-header resizable-column"
                  style={{ width: columnWidths['photo'] || 60 }}
                >
                  Photo
                  <div 
                    className="resizer" 
                    onMouseDown={(e) => handleResizeStart(e, 'photo')}
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      handleResizeStart({...e, clientX: touch.clientX}, 'photo');
                    }}
                  />
                </th>
                <th 
                  id="column-name" 
                  className="fixed-column-header resizable-column"
                  style={{ width: columnWidths['name'] || 200 }}
                >
                  Name
                  <div 
                    className="resizer" 
                    onMouseDown={(e) => handleResizeStart(e, 'name')}
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      handleResizeStart({...e, clientX: touch.clientX}, 'name');
                    }}
                  />
                </th>
                <th 
                  id="column-result" 
                  className="resizable-column"
                  style={{ width: columnWidths['result'] || 120 }}
                >
                  Match 
                  <div 
                    className="resizer" 
                    onMouseDown={(e) => handleResizeStart(e, 'result')}
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      handleResizeStart({...e, clientX: touch.clientX}, 'result');
                    }}
                  />
                </th>
                <th 
                  id="column-title" 
                  className="resizable-column"
                  style={{ width: columnWidths['title'] || 200 }}
                >
                  Title
                  <div 
                    className="resizer" 
                    onMouseDown={(e) => handleResizeStart(e, 'title')}
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      handleResizeStart({...e, clientX: touch.clientX}, 'title');
                    }}
                  />
                </th>
                {matchCriteriaArray.map((criteria, index) => (
                  <th 
                    key={criteria} 
                    id={`column-${criteria}`}
                    className="resizable-column"
                    style={{ width: columnWidths[criteria] || 150 }}
                  >
                    {criteria.charAt(0).toUpperCase() + criteria.slice(1)} Match
                    <div 
                      className="resizer" 
                      onMouseDown={(e) => handleResizeStart(e, criteria)}
                      onTouchStart={(e) => {
                        const touch = e.touches[0];
                        handleResizeStart({...e, clientX: touch.clientX}, criteria);
                      }}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile, index) => {
                const criteriaResults = parseCriteriaResults(profile);
                return (
                  <tr key={index} className="excel-row">
                    <td className="fixed-column excel-cell text-center">
                      <div className="text-gray-700 font-medium">{index + 1}</div>
                    </td>
                    <td className="fixed-column excel-cell text-center">
                      {profile.image_url && profile.image_url !== "" ? (
                        <img 
                          src={profile.image_url} 
                          alt={`${profile.first_name || ''} ${profile.last_name || ''}`}
                          className="w-8 h-8 rounded-full object-cover border border-gray-200 mx-auto"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = "https://static.licdn.com/aero-v1/sc/h/9c8pery4andzj6ohjkjp54ma2"; // Default LinkedIn placeholder
                          }}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200 mx-auto"></div>
                      )}
                    </td>
                    <td className="fixed-column excel-cell">
                      <div className="flex flex-row items-center gap-2">
                        <div className="font-medium text-gray-900 truncate">
                          {profile.first_name && profile.last_name 
                            ? `${profile.first_name} ${profile.last_name}` 
                            : 'N/A'}
                        </div>
                        <a
                          href={profile.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium flex items-center gap-1"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </td>
                    <td className="excel-cell">
                        {profile.all_criteria_met === true ? (
                        <div className="flex items-center">
                          <span className="text-green-600 mr-1">✓</span> 
                          <span className="text-sm"></span>
                        </div>
                        ) : profile.all_criteria_met === false ? (
                        <div className="flex items-center">
                          <span className="text-red-600 mr-1">✗</span> 
                          <span className="text-sm"></span>
                        </div>
                        ) : (
                        <div className="flex items-center">
                          <span className="text-gray-400 mr-1">?</span>
                          <span className="text-sm">Unknown</span>
                      </div>
                        )}
                    </td>
                    <td className="excel-cell">
                      <div className="text-sm text-gray-700 truncate">
                        {profile.title || 'N/A'}
                      </div>
                    </td>
                    {matchCriteriaArray.map(criteria => (
                      <td key={criteria} className="excel-cell">
                        {renderMatchStatus(criteriaResults[criteria], profile, criteria)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* Global styles to ensure tooltips are always on top */}
        <style jsx>{`
          .tooltip {
            position: absolute;
            z-index: 9999999 !important;
          }
          
          /* Ensure the tooltip container is above all other elements */
          .table-container {
            isolation: isolate;
          }
          
          /* Make sure tooltips are rendered above any borders */
          .excel-table {
            border-collapse: separate;
            border-spacing: 0;
          }
        `}</style>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className={`${(searchState === 'completed' && searchResults) || (searchState === 'processing' && streamingProfiles.length > 0) ? 'max-w-7xl' : 'max-w-3xl'} mx-auto`}>
        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Prospect Search</h1>
              <p className="text-gray-600">Find key decision makers and prospects from any company</p>
            </div>
               <div>
              <img src="/prospecto.svg" alt="Prospecto Logo" className="w-auto h-8" />
              </div>
          </div>
        </div>

        {/* Layout changes based on search state */}
        {(searchState === 'completed' && searchResults) || (searchState === 'processing' && streamingProfiles.length > 0) ? (
          // Two-column layout for results
          <div className="flex gap-6">
            {/* Left Column - Table */}
            <div className="flex-1 max-w-full overflow-hidden">
              {(() => {
                // Use streaming profiles during processing, final results when completed
                const profilesToShow = searchState === 'completed' 
                  ? (searchResults.profiles.results?.selected_profiles || [])
                  : streamingProfiles;
                
                const uniqueProfiles = profilesToShow.filter((profile, index, self) => 
                  index === self.findIndex(p => p.url === profile.url)
                );
                const sortedProfiles = [...uniqueProfiles].sort((a, b) => {
                  // Helper function to count probably_matched criteria
                  const countProbablyMatched = (profile) => {
                    const criteriaResults = parseCriteriaResults(profile);
                    return Object.values(criteriaResults).filter(status => status === 'probably_matched').length;
                  };

                  // First priority: All matched profiles (all_criteria_met === true)
                  if (a.all_criteria_met === true && b.all_criteria_met !== true) return -1;
                  if (b.all_criteria_met === true && a.all_criteria_met !== true) return 1;

                  // Second priority: Profiles with probably_matched (sorted by count, most first)
                  const aProbablyCount = countProbablyMatched(a);
                  const bProbablyCount = countProbablyMatched(b);
                  
                  if (aProbablyCount > 0 && bProbablyCount === 0) return -1;
                  if (bProbablyCount > 0 && aProbablyCount === 0) return 1;
                  if (aProbablyCount > 0 && bProbablyCount > 0) {
                    return bProbablyCount - aProbablyCount; // Most probably_matched first
                  }

                  // Third priority: Score-based sorting for remaining profiles
                  return (b.score || 0) - (a.score || 0);
                });

                const tableTitle = searchState === 'completed' ? "All Profiles" : "Streaming Profiles";
                const tableIcon = searchState === 'completed' 
                  ? <Users className="text-blue-600" size={20} />
                  : <Clock className="text-orange-600" size={20} />;
                const tableBadgeClass = searchState === 'completed' 
                  ? "bg-blue-100 text-blue-800"
                  : "bg-orange-100 text-orange-800";

                return renderProfileTable(
                  sortedProfiles,
                  tableTitle,
                  tableIcon,
                  tableBadgeClass
                );
              })()}
            </div>

            {/* Right Column - Controls and Info */}
            <div className="w-80 flex-shrink-0">
              {/* Search Criteria */}
              <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Search className="text-blue-600" size={18} />
                  <h3 className="text-base font-medium text-gray-800">Search Criteria</h3>
                </div>
                
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Criteria Sentence</label>
              <textarea
                value={criteriaSentence}
                onChange={(e) => setCriteriaSentence(e.target.value)}
                    placeholder="Enter search criteria"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                    rows={2}
                  />
            </div>
            
                <div className="grid grid-cols-1 gap-3">
              <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Profile Count</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={desiredProfileCount}
                  onChange={(e) => setDesiredProfileCount(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>
              <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Search Method</label>
                <select
                  value={searchMethod}
                  onChange={(e) => setSearchMethod(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                >
                  <option value="exa_search">Exa Search</option>
                  <option value="tavily_search">Tavily Search</option>
                      <option value="parallel_search">Parallel Search</option>
                </select>
              </div>
              <button
                onClick={initiateSearch}
                    disabled={!criteriaSentence.trim()}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1 text-sm font-medium"
              >
                    <Search size={16} />
                    New Search
              </button>
          </div>
        </div>

              {/* Streaming Status */}
              {searchState === 'processing' && streamingProfiles.length > 0 && (
                <div className="bg-white rounded-md shadow-sm border p-3 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="text-orange-600" size={16} />
                    <h3 className="text-sm font-medium text-gray-800">Live Streaming</h3>
                  </div>
                  <div className="space-y-2">
                    <div className="bg-orange-50 p-2 rounded-md border border-orange-100">
                      <div className="text-orange-600 font-medium text-xs mb-1">Profiles Found</div>
                      <div className="text-orange-900 text-lg font-medium flex items-center gap-2">
                        {streamingProfiles.length}
                        {newProfilesCount > 0 && (
                          <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full animate-pulse">
                            +{newProfilesCount} new
                          </span>
                )}
              </div>
            </div>
                    
                    <div className="bg-gray-50 p-2 rounded-md border border-gray-100">
                      <div className="text-gray-600 font-medium text-xs mb-1">Status</div>
                      <div className="text-gray-900 text-xs">
                        {message}
                </div>
              </div>
            </div>
          </div>
        )}

              {/* Search Summary */}
              {searchState === 'completed' && searchResults.profiles?.search_summary && (
                <div className="bg-white rounded-md shadow-sm border p-3 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Building className="text-blue-600" size={16} />
                    <h3 className="text-sm font-medium text-gray-800">Search Summary</h3>
                </div>
                  <div className="space-y-2">
                    <div className="bg-gray-50 p-2 rounded-md border border-gray-100">
                      <div className="text-gray-600 font-medium text-xs mb-1">Company</div>
                      <div className="text-gray-900 text-sm font-medium">{searchResults.profiles.search_summary.company}</div>
            </div>

                    <div className="bg-gray-50 p-2 rounded-md border border-gray-100">
                      <div className="text-gray-600 font-medium text-xs mb-1">Search Terms</div>
                      <div className="text-gray-900 text-xs">
                      {searchResults.profiles.search_summary.search_terms.join(', ')}
                    </div>
                  </div>
                </div>
              </div>
            )}

              {/* Criteria Section */}
              {searchState === 'completed' && searchResults.profiles?.search_summary?.criteria && (
                <div className="bg-white rounded-md shadow-sm border p-3 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="text-purple-600" size={16} />
                    <h3 className="text-sm font-medium text-gray-800">Criteria</h3>
                        </div>
                  <div className="space-y-2">
                    {Object.entries(searchResults.profiles.search_summary.criteria).map(([key, value]) => (
                      <div key={key} className="bg-purple-50 p-2 rounded-md border border-purple-100">
                        <div className="text-purple-600 font-medium text-xs mb-1 capitalize">
                          {key.replace(/_/g, ' ')}
                      </div>
                        <div className="text-purple-800 text-xs">
                          {value}
                    </div>
                  </div>
                    ))}
                </div>
              </div>
            )}

              {/* Statistics */}
              {searchState === 'completed' && searchResults.profiles?.statistics && (
                <div className="bg-white rounded-md shadow-sm border p-3 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="text-blue-600" size={16} />
                    <h3 className="text-sm font-medium text-gray-800">Statistics</h3>
                  </div>
                  <div className="bg-gray-50 p-2 rounded-md border border-gray-100">
                    <div className="text-gray-600 font-medium text-xs mb-1">Total Profiles</div>
                    <div className="text-gray-900 text-lg font-medium">
                      {searchResults.profiles.statistics.unique_profiles.selected || 
                       searchResults.profiles.statistics.total_selected || 0}
                    </div>
                  </div>
              </div>
            )}

            {/* Action Buttons */}
              <div className="space-y-2">
                {searchState === 'completed' && (
              <button
                onClick={exportToCSV}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium flex items-center justify-center gap-1"
              >
                    <Download size={16} />
                Download CSV
              </button>
                )}
              <button
                onClick={resetSearch}
                  className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm font-medium"
              >
                  Reset Search
              </button>
            </div>
          </div>
          </div>
        ) : (
          // Single column layout for search form
          <div>
        {/* Search Section */}
            <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 mb-1">
                  <Search className="text-blue-600" size={18} />
                  <h3 className="text-base font-medium text-gray-800">Search Criteria</h3>
                </div>
                
            <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Criteria Sentence</label>
              <textarea
                value={criteriaSentence}
                onChange={(e) => setCriteriaSentence(e.target.value)}
                placeholder="Enter search criteria (e.g., OpenAI - Chief Technology Officer, VP of Engineering)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                disabled={searchState === 'searching' || searchState === 'processing'}
                    rows={2}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && initiateSearch()}
              />
              <p className="text-xs text-gray-500 mt-1">
                    Format: "please ADD COMPANY NAME - Position1, Position2, Position3 ... and other criteria"
              </p>
            </div>
            
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Profile Count</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={desiredProfileCount}
                  onChange={(e) => setDesiredProfileCount(Number(e.target.value))}
                  placeholder="Max profiles (e.g., 10)"
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  disabled={searchState === 'searching' || searchState === 'processing'}
                />
      </div>
              <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Search Method</label>
                <select
                  value={searchMethod}
                  onChange={(e) => setSearchMethod(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  disabled={searchState === 'searching' || searchState === 'processing'}
                >
                  <option value="exa_search">Exa Search</option>
                  <option value="tavily_search">Tavily Search</option>
                  <option value="parallel_search">Parallel Search</option>
                </select>
    </div>
              <button
                onClick={initiateSearch}
                disabled={!criteriaSentence.trim() || searchState === 'searching' || searchState === 'processing'}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1 text-sm font-medium"
              >
                    <Search size={16} />
                Search
              </button>
            </div>
          </div>
        </div>



        {/* Status Section */}
        {(searchState === 'searching' || searchState === 'processing') && (
              <div className="bg-blue-50 border border-blue-100 rounded-md p-3 mb-4">
                <div className="flex items-center gap-2">
                  <Clock className="text-blue-600 animate-spin" size={18} />
              <div>
                    <p className="font-medium text-blue-800 text-sm">
                  {searchState === 'searching' ? 'Initiating search...' : 'Processing'}
                </p>
                    <p className="text-blue-700 text-xs">{message}</p>
                {requestId && (
                      <p className="text-blue-600 text-xs mt-0.5">Request ID: {requestId}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Error Section */}
        {searchState === 'error' && (
              <div className="bg-red-50 border border-red-100 rounded-md p-3 mb-4">
            <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                <div className="text-red-600">⚠️</div>
                <div>
                      <p className="font-medium text-red-800 text-sm">Search Failed</p>
                      <p className="text-red-700 text-xs">{error}</p>
                </div>
              </div>
              <button
                onClick={resetSearch}
                    className="text-red-600 hover:text-red-800 text-xs font-medium px-2 py-1 border border-red-200 rounded"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProspectSearch;


