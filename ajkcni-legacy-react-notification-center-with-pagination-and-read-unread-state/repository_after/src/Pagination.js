var React = require('react');
// var PropTypes = require('prop-types');

class Pagination extends React.Component {
  constructor(props) {
    super(props);
    this.handlePrev = this.handlePrev.bind(this);
    this.handleNext = this.handleNext.bind(this);
  }

  componentDidUpdate(prevProps) {
    if (this.props.currentPage !== prevProps.currentPage) {
       // Requirement: Focus restoration. 
    }
  }

  handlePrev(e) {
    if (e.type === 'keydown' && e.key !== 'Enter') return;
    this.props.onPrev();
  }

  handleNext(e) {
    if (e.type === 'keydown' && e.key !== 'Enter') return;
    this.props.onNext();
  }

  render() {
    var currentPage = this.props.currentPage;
    var totalPages = this.props.totalPages;

    return React.createElement('div', { className: 'pagination-controls' },
      React.createElement('button', {
        className: 'pagination-prev',
        onClick: this.handlePrev,
        onKeyDown: this.handlePrev,
        disabled: currentPage === 1,
        'aria-label': 'Previous Page'
      }, 'Previous'),
      
      React.createElement('span', { className: 'pagination-info' },
        'Page ' + currentPage + ' of ' + totalPages
      ),
      
      React.createElement('button', {
        className: 'pagination-next',
        onClick: this.handleNext,
        onKeyDown: this.handleNext,
        disabled: currentPage === totalPages,
        'aria-label': 'Next Page'
      }, 'Next')
    );
  }
}

Pagination.displayName = 'Pagination';
// Pagination.propTypes = {
//   currentPage: PropTypes.number.isRequired,
//   totalPages: PropTypes.number.isRequired,
//   onNext: PropTypes.func.isRequired,
//   onPrev: PropTypes.func.isRequired
// };

module.exports = Pagination;
