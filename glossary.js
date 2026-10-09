// Sample initial data array (or fetch from Firestore)
let glossaryTermsList = [
    { id: '1', term: 'التورية', subject: 'البلاغة', description: 'أن يذكر المتكلم لفظاً مفاداً له معنيان: أحدهما قريب والآخر بعيد، ويريد المعنى البعيد.' },
    { id: '2', term: 'حسن التعليل', subject: 'البلاغة', description: 'أن ينكر الأديب صراحة أو ضمناً علة الشيء المعروفة ويأتي بعلم أدبية طريفة تناسب الغرض.' },
    { id: '3', term: 'القصر', subject: 'البلاغة', description: 'تخصيص أمر بآخر بطريق مخصوص.' }
  ];
  
  function renderGlossaryTerms(terms) {
    const container = document.getElementById('glossaryResultsContainer');
    if (!container) return;
  
    if (!terms || terms.length === 0) {
      container.innerHTML = `<div class="glossary-empty-line"></div>`;
      return;
    }
  
    container.innerHTML = terms.map(item => `
      <div class="glossary-term-item">
        <div class="glossary-term-header">
          <h4 class="glossary-term-title">${item.term}</h4>
          <span class="glossary-term-badge">${item.subject}</span>
        </div>
        <p class="glossary-term-desc">${item.description}</p>
      </div>
    `).join('');
  }
  
  function handleGlossarySearch(query) {
    const cleanQuery = query.trim().toLowerCase();
    
    if (!cleanQuery) {
      // Show default empty decorative state when search input is clear
      renderGlossaryTerms([]);
      return;
    }
  
    const filtered = glossaryTermsList.filter(item => 
      item.term.toLowerCase().includes(cleanQuery) || 
      item.description.toLowerCase().includes(cleanQuery) ||
      item.subject.toLowerCase().includes(cleanQuery)
    );
  
    renderGlossaryTerms(filtered);
  }
  
  // Modal Handling
  function openAddTermModal() {
    const modal = document.getElementById('addTermModal');
    if (modal) modal.classList.add('show');
  }
  
  function closeAddTermModal() {
    const modal = document.getElementById('addTermModal');
    if (modal) modal.classList.remove('show');
  }
  
  function handleSaveNewTerm(e) {
    e.preventDefault();
  
    const term = document.getElementById('newTermInput').value.trim();
    const subject = document.getElementById('newTermSubjectSelect').value;
    const description = document.getElementById('newTermDescInput').value.trim();
  
    if (!term || !description) return;
  
    const newEntry = { id: Date.now().toString(), term, subject, description };
    glossaryTermsList.unshift(newEntry);
  
    closeAddTermModal();
    e.target.reset();
  
    // Highlight search with the new term
    document.getElementById('glossarySearchInput').value = term;
    handleGlossarySearch(term);
  }