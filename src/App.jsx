import React, { useState, useEffect, useRef } from 'react';
import logoImage from './image.png'; // Import the image
import { Search, Clock, CheckCircle, ExternalLink, User, Building, Users, Download } from 'lucide-react';
import './App.css'; // Make sure to use the existing CSS file

const ProspectSearch = () => {
  const [criteriaSentence, setCriteriaSentence] = useState('SDE at Zomato');
  const [searchMethod, setSearchMethod] = useState('exa_search');
  const [desiredProfileCount, setDesiredProfileCount] = useState(10);
  const [searchState, setSearchState] = useState('idle'); // idle, searching, processing, completed, error
  const [requestId, setRequestId] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [columnWidths, setColumnWidths] = useState({});
  const [isResizing, setIsResizing] = useState(false);
  const [resizingColumn, setResizingColumn] = useState(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);
  const tableRef = useRef(null);



  



  const initiateSearch = async () => {
    if (!criteriaSentence.trim()) return;
    
    setSearchState('searching');
    setError('');
    
    try {
      const response = await fetch('http://139.59.27.253:8000/prospect/search', {
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
      const response = await fetch(`http://139.59.27.253:8000/prospect/status/${id}`);
      const data = await response.json();
      
      setMessage(data.message);
      
      if (data.status === 'completed') {
        setSearchResults(data);
        setSearchState('completed');
      } else if (data.status === 'processing') {
        // Continue polling every 30 seconds, but store the timer reference
        pollingTimerRef.current = setTimeout(() => pollStatus(id), 30000);
      } else if (data.status === 'failed') {
        setError(data.message || 'Search failed');
        setSearchState('error');
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
    setMessage('');
    setError('');
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
      try {
        const reason = typeof profile.reason === 'string' ? JSON.parse(profile.reason) : profile.reason;
        if (reason) {
          Object.keys(reason).forEach(key => allMatchCriteria.add(key));
        }
      } catch (e) {}
    });
    
    const matchCriteriaArray = Array.from(allMatchCriteria);
    const fullHeader = [...csvHeader, ...matchCriteriaArray.map(c => `${c} Match`)]; 
    
    // Create CSV rows
    const csvRows = profiles.map(profile => {
      // Parse reason data
      let reasonData = {};
      try {
        reasonData = typeof profile.reason === 'string' ? JSON.parse(profile.reason) : (profile.reason || {});
      } catch (e) {}
      
      // Basic profile data
      const row = [
        `"${profile.first_name || ''} ${profile.last_name || ''}"`,
        `"${profile.title || ''}"`,
        `"${profile.company || ''}"`,
        `"${profile.url || ''}"`,
        profile.all_criteria_met === true ? 'Yes' : 'No',
        `"${profile.search_term || ''}"`,
        `"${profile.reason || ''}"`
      ];
      
      // Add match criteria data
      matchCriteriaArray.forEach(criteria => {
        row.push(`"${reasonData[criteria] || ''}"`);
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

    // Helper function to parse reason and extract match information
    const parseReason = (reason) => {
      if (!reason) return {};
      
      try {
        // Handle both string and object formats
        const reasonObj = typeof reason === 'string' ? JSON.parse(reason) : reason;
        return reasonObj;
      } catch (e) {
        // If parsing fails, return empty object
        return {};
      }
    };

      // Helper function to render match status
  const renderMatchStatus = (status) => {
    if (status === 'matched') {
      return <div className="flex items-center"><span className="text-green-600 mr-1">✓</span> Matched</div>;
    } else if (status === 'not_matched') {
      return <div className="flex items-center"><span className="text-red-600 mr-1">✗</span> Not Matched</div>;
    } else if (status === 'not_found') {
      return <div className="flex items-center"><span className="text-gray-400 mr-1">?</span> Not Found</div>;
    } else {
      return <div className="flex items-center"><span className="text-gray-400 mr-1">-</span></div>;
    }
  };

    // Get unique match criteria from all profiles
    const allMatchCriteria = new Set();
    profiles.forEach(profile => {
      const reason = parseReason(profile.reason);
      Object.keys(reason).forEach(key => allMatchCriteria.add(key));
    });

    const matchCriteriaArray = Array.from(allMatchCriteria);

    return (
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex items-center gap-2 mb-3">
          <User className="text-blue-600" size={18} />
          <h3 className="text-base font-medium text-gray-800">{title}</h3>
          <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">{profiles.length} profiles</span>
        </div>
        
        <div className="table-container">
          <table ref={tableRef} className="excel-table">
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
                  Result
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
                const reason = parseReason(profile.reason);
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
                          <span className="text-sm">Met</span>
                        </div>
                      ) : profile.all_criteria_met === false ? (
                        <div className="flex items-center">
                          <span className="text-red-600 mr-1">✗</span> 
                          <span className="text-sm">Not Met</span>
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
                        {renderMatchStatus(reason[criteria])}
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
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className={`${searchState === 'completed' && searchResults ? 'max-w-7xl' : 'max-w-3xl'} mx-auto`}>
        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Prospect Search</h1>
              <p className="text-gray-600">Find key decision makers and prospects from any company</p>
            </div>
            <div>
              <img src={logoImage} alt="logo" className="w-70 h-12" />           
            </div>
          </div>
        </div>

        {/* Layout changes based on search state */}
        {searchState === 'completed' && searchResults ? (
          // Two-column layout for results
          <div className="flex gap-6">
            {/* Left Column - Table */}
            <div className="flex-1 max-w-full overflow-hidden">
              {(() => {
                const allProfiles = searchResults.profiles.results?.selected_profiles || [];
                const uniqueProfiles = allProfiles.filter((profile, index, self) => 
                  index === self.findIndex(p => p.url === profile.url)
                );
                const sortedProfiles = [...uniqueProfiles].sort((a, b) => {
                  if (a.all_criteria_met === true && b.all_criteria_met !== true) return -1;
                  if (b.all_criteria_met === true && a.all_criteria_met !== true) return 1;
                  return (b.score || 0) - (a.score || 0);
                });

                return renderProfileTable(
                  sortedProfiles,
                  "All Profiles",
                  <Users className="text-blue-600" size={20} />,
                  "bg-blue-100 text-blue-800"
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

              {/* Search Summary */}
              {searchResults.profiles?.search_summary && (
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
              {searchResults.profiles?.search_summary?.criteria && (
                <div className="bg-white rounded-md shadow-sm border p-3 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="text-purple-600" size={16} />
                    <h3 className="text-sm font-medium text-gray-800">Criteria kp</h3>
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
              {searchResults.profiles?.statistics && (
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
                <button
                  onClick={exportToCSV}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium flex items-center justify-center gap-1"
                >
                  <Download size={16} />
                  Download CSV
                </button>
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


