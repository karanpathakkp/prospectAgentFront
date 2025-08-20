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
          'Content-Type': 'application/json',
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
    const allColumns = ['name', 'result', 'title', 'actions'];
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
      const response = await fetch(API_ENDPOINTS.STATUS(id));
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
        pollingTimerRef.current = setTimeout(() => pollStatus(id), 5000);
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
        pollingTimerRef.current = setTimeout(() => pollStatus(id), 5000);
      }
    } catch (err) {
      setError('Failed to check status');
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
                  id="column-name" 
                  className="fixed-column-header resizable-column"
                  style={{ width: columnWidths['name'] || 150 }}
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
                <th 
                  id="column-actions" 
                  className="resizable-column"
                  style={{ width: columnWidths['actions'] || 100 }}
                >
                  Actions
                  <div 
                    className="resizer" 
                    onMouseDown={(e) => handleResizeStart(e, 'actions')}
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      handleResizeStart({...e, clientX: touch.clientX}, 'actions');
                    }}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile, index) => {
                const criteriaResults = parseCriteriaResults(profile);
                return (
                  <tr key={index} className="excel-row">
                    <td className="fixed-column excel-cell">
                      <div className="font-medium text-gray-900 truncate">
                        {profile.first_name && profile.last_name 
                          ? `${profile.first_name} ${profile.last_name}` 
                          : 'N/A'}
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
                    <td className="excel-cell">
                        <a
                          href={profile.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"
                        >
                          View
                          <ExternalLink size={14} />
                        </a>
                    </td>
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
              <svg width="208" height="39" viewBox="0 0 208 39" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-auto h-8">
                <g clipPath="url(#clip0_539_9426)">
                  <path d="M19.7437 38.5583C30.6479 38.5583 39.4874 29.9267 39.4874 19.2792C39.4874 8.63157 30.6479 0 19.7437 0C8.83956 0 0 8.63157 0 19.2792C0 29.9267 8.83956 38.5583 19.7437 38.5583Z" fill="#6640FF"/>
                  <mask id="mask0_539_9426" style={{maskType:'luminance'}} maskUnits="userSpaceOnUse" x="11" y="9" width="22" height="21">
                    <path d="M32.0647 9.69922L11.5898 9.69922L11.5898 29.6923L32.0647 29.6923V9.69922Z" fill="white"/>
                  </mask>
                  <g mask="url(#mask0_539_9426)">
                    <path d="M11.5939 21.1111C15.6365 21.1111 19.587 21.1471 23.5366 21.0981C25.9665 21.068 28.2347 19.3061 28.8849 17.0995C29.6789 14.4024 28.5847 11.7975 26.0895 10.454C25.1657 9.95642 24.1545 9.72015 23.088 9.71013C21.2605 9.69312 19.4331 9.69913 17.6056 9.70714C14.323 9.72015 11.6161 12.1559 11.5961 15.1193C11.584 16.9714 11.5939 18.8246 11.5939 20.6777C11.5939 20.8067 11.5939 20.9348 11.5939 21.1111Z" fill="white"/>
                    <path d="M11.6099 22.7754C11.6099 24.1416 11.5574 25.4038 11.6224 26.652C11.7099 28.309 12.7344 29.6171 13.9213 29.6611C15.0019 29.6998 16.0852 29.7052 17.1658 29.6611C18.4691 29.6065 19.4772 28.0463 19.4647 26.1813C19.4522 24.3232 18.4115 22.7984 17.1083 22.7824C15.3009 22.7614 13.4923 22.7772 11.6086 22.7772L11.6099 22.7754Z" fill="white"/>
                  </g>
                  <path d="M54.018 29.8193V7.01599L62.5692 7.01599C64.321 7.01599 65.7908 7.34261 66.9784 7.99583C68.1735 8.64905 69.0754 9.54722 69.6841 10.6904C70.3002 11.8261 70.6083 13.1177 70.6083 14.5651C70.6083 16.0275 70.3002 17.3265 69.6841 18.4622C69.068 19.5979 68.1587 20.4924 66.9562 21.1456C65.7537 21.7914 64.2728 22.1143 62.5135 22.1143H56.8461V18.7183H61.9568C62.9812 18.7183 63.82 18.5401 64.4732 18.1838C65.1264 17.8275 65.6089 17.3376 65.9207 16.7141C66.2399 16.0906 66.3995 15.3743 66.3995 14.5651C66.3995 13.756 66.2399 13.0434 65.9207 12.4273C65.6089 11.8112 65.1227 11.3324 64.4621 10.991C63.8088 10.6421 62.9663 10.4677 61.9345 10.4677H58.1488V29.8193H54.018ZM74.0182 29.8193V12.7168H77.9264V15.5672H78.1045C78.4163 14.58 78.9508 13.8191 79.7079 13.2847C80.4725 12.7428 81.3447 12.4719 82.3245 12.4719C82.5472 12.4719 82.7959 12.483 83.0705 12.5053C83.3526 12.5201 83.5864 12.5461 83.772 12.5832V16.291C83.6012 16.2316 83.3303 16.1796 82.9592 16.1351C82.5954 16.0831 82.2428 16.0572 81.9014 16.0572C81.1665 16.0572 80.5059 16.2168 79.9195 16.5359C79.3405 16.8477 78.884 17.282 78.5499 17.8387C78.2159 18.3954 78.0489 19.0375 78.0489 19.7649V29.8193H74.0182ZM86.4498 29.8193V12.7168H90.4805V29.8193H86.4498ZM88.4763 10.2895C87.8379 10.2895 87.2886 10.078 86.8284 9.65486C86.3682 9.22433 86.138 8.70843 86.138 8.10717C86.138 7.49849 86.3682 6.98259 86.8284 6.55948C87.2886 6.12895 87.8379 5.91368 88.4763 5.91368C89.1221 5.91368 89.6714 6.12895 90.1242 6.55948C90.5844 6.98259 90.8145 7.49849 90.8145 8.10717C90.8145 8.70843 90.5844 9.22433 90.1242 9.65486C89.6714 10.078 89.1221 10.2895 88.4763 10.2895ZM94.6253 29.8193V12.7168H98.4778V15.6229H98.6782C99.0345 14.6431 99.6246 13.8785 100.449 13.3292C101.273 12.7725 102.256 12.4941 103.399 12.4941C104.557 12.4941 105.533 12.7762 106.328 13.3404C107.129 13.8971 107.693 14.6579 108.02 15.6229H108.198C108.577 14.6728 109.215 13.9156 110.113 13.3515C111.019 12.7799 112.092 12.4941 113.331 12.4941C114.905 12.4941 116.189 12.9915 117.184 13.9862C118.178 14.9808 118.676 16.432 118.676 18.3397V29.8193H114.634V18.9633C114.634 17.9018 114.352 17.1261 113.788 16.6362C113.224 16.1388 112.533 15.8901 111.717 15.8901C110.744 15.8901 109.983 16.1945 109.434 16.8032C108.892 17.4044 108.621 18.1876 108.621 19.1525V29.8193H104.669V18.7962C104.669 17.9129 104.401 17.2077 103.867 16.6807C103.34 16.1537 102.649 15.8901 101.796 15.8901C101.217 15.8901 100.69 16.0386 100.215 16.3355C99.7397 16.625 99.3611 17.037 99.0791 17.5714C98.797 18.0985 98.6559 18.7146 98.6559 19.4198V29.8193H94.6253ZM130.336 30.1534C128.622 30.1534 127.141 29.7971 125.894 29.0845C124.654 28.3644 123.7 27.3475 123.032 26.0336C122.364 24.7123 122.03 23.1572 122.03 21.3683C122.03 19.6091 122.364 18.0651 123.032 16.7364C123.708 15.4002 124.65 14.361 125.86 13.6187C127.07 12.869 128.492 12.4941 130.125 12.4941C131.179 12.4941 132.173 12.6649 133.109 13.0063C134.051 13.3404 134.883 13.86 135.603 14.5651C136.33 15.2703 136.902 16.1685 137.318 17.2597C137.733 18.3434 137.941 19.635 137.941 21.1345V22.3704H123.923V19.6536H134.077C134.07 18.8816 133.903 18.195 133.576 17.5937C133.25 16.985 132.793 16.5063 132.207 16.1574C131.628 15.8085 130.952 15.6341 130.18 15.6341C129.356 15.6341 128.633 15.8345 128.009 16.2353C127.386 16.6287 126.899 17.1483 126.551 17.7941C126.209 18.4325 126.035 19.134 126.027 19.8985V22.2702C126.027 23.2649 126.209 24.1185 126.573 24.8311C126.936 25.5363 127.445 26.0782 128.098 26.4567C128.751 26.8279 129.516 27.0135 130.392 27.0135C130.978 27.0135 131.509 26.9318 131.984 26.7685C132.459 26.5978 132.871 26.3491 133.22 26.0225C133.569 25.6959 133.832 25.2913 134.011 24.8088L137.774 25.2319C137.536 26.2266 137.084 27.0951 136.416 27.8374C135.755 28.5723 134.909 29.1438 133.877 29.5521C132.845 29.9529 131.665 30.1534 130.336 30.1534ZM141.529 29.8193V7.01599H150.08C151.832 7.01599 153.302 7.32034 154.49 7.92902C155.685 8.5377 156.587 9.39134 157.195 10.4899C157.811 11.5811 158.119 12.8542 158.119 14.3091C158.119 15.7714 157.808 17.0407 157.184 18.117C156.568 19.1859 155.659 20.0136 154.456 20.6C153.254 21.179 151.777 21.4685 150.025 21.4685L143.934 21.4685V18.0391L149.468 18.0391C150.492 18.0391 151.331 17.8981 151.984 17.616C152.638 17.3265 153.12 16.9071 153.432 16.3578C153.751 15.8011 153.911 15.1182 153.911 14.3091C153.911 13.5 153.751 12.8096 153.432 12.238C153.113 11.6591 152.626 11.2211 151.973 10.9242C151.32 10.6198 150.477 10.4677 149.446 10.4677H145.66V29.8193H141.529ZM153.309 19.4866L158.955 29.8193H154.345L148.8 19.4866H153.309ZM168.959 30.1534C167.289 30.1534 165.841 29.7859 164.616 29.0511C163.392 28.3162 162.441 27.2881 161.766 25.9668C161.098 24.6455 160.764 23.1016 160.764 21.3349C160.764 19.5682 161.098 18.0205 161.766 16.6918C162.441 15.3631 163.392 14.3313 164.616 13.5965C165.841 12.8616 167.289 12.4941 168.959 12.4941C170.629 12.4941 172.076 12.8616 173.301 13.5965C174.526 14.3313 175.472 15.3631 176.141 16.6918C176.816 18.0205 177.154 19.5682 177.154 21.3349C177.154 23.1016 176.816 24.6455 176.141 25.9668C175.472 27.2881 174.526 28.3162 173.301 29.0511C172.076 29.7859 170.629 30.1534 168.959 30.1534ZM168.981 26.9244C169.887 26.9244 170.644 26.6757 171.253 26.1784C171.861 25.6736 172.314 24.9981 172.611 24.1519C172.915 23.3057 173.067 22.363 173.067 21.3238C173.067 20.2771 172.915 19.3307 172.611 18.4845C172.314 17.6308 171.861 16.9516 171.253 16.4469C170.644 15.9421 169.887 15.6897 168.981 15.6897C168.053 15.6897 167.281 15.9421 166.665 16.4469C166.056 16.9516 165.6 17.6308 165.296 18.4845C164.999 19.3307 164.85 20.2771 164.85 21.3238C164.85 22.363 164.999 23.3057 165.296 24.1519C165.6 24.9981 166.056 25.6736 166.665 26.1784C167.281 26.6757 168.053 26.9244 168.981 26.9244ZM184.605 7.01599V29.8193H180.575V7.01599H184.605ZM196.322 30.1534C194.607 30.1534 193.126 29.7971 191.879 29.0845C190.639 28.3644 189.686 27.3475 189.018 26.0336C188.349 24.7123 188.015 23.1572 188.015 21.3683C188.015 19.6091 188.349 18.0651 189.018 16.7364C189.693 15.4002 190.636 14.361 191.846 13.6187C193.056 12.869 194.477 12.4941 196.11 12.4941C197.164 12.4941 198.159 12.6649 199.094 13.0063C200.037 13.3404 200.868 13.86 201.588 14.5651C202.316 15.2703 202.887 16.1685 203.303 17.2597C203.719 18.3434 203.927 19.635 203.927 21.1345V22.3704H189.908V19.6536H200.063C200.055 18.8816 199.888 18.195 199.562 17.5937C199.235 16.985 198.779 16.5063 198.192 16.1574C197.613 15.8085 196.938 15.6341 196.166 15.6341C195.342 15.6341 194.618 15.8345 193.995 16.2353C193.371 16.6287 192.885 17.1483 192.536 17.7941C192.195 18.4325 192.02 19.134 192.013 19.8985V22.2702C192.013 23.2649 192.195 24.1185 192.558 24.8311C192.922 25.5363 193.43 26.0782 194.084 26.4567C194.737 26.8279 195.501 27.0135 196.377 27.0135C196.964 27.0135 197.495 26.9318 197.97 26.7685C198.445 26.5978 198.857 26.3491 199.206 26.0225C199.554 25.6959 199.818 25.2913 199.996 24.8088L203.76 25.2319C203.522 26.2266 203.069 27.0951 202.401 27.8374C201.74 28.5723 200.894 29.1438 199.862 29.5521C198.831 29.9529 197.65 30.1534 196.322 30.1534Z" fill="#181D27"/>
                </g>
                <defs>
                  <clipPath id="clip0_539_9426">
                    <rect width="207.188" height="39" fill="white"/>
                  </clipPath>
                </defs>
              </svg>
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
                    Format: "Company - Position1, Position2, Position3"
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


