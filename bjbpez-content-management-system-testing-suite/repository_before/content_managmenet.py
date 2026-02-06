from datetime import datetime
import threading

articles = {}
article_versions = {}
workflows = {}
article_id_counter = 0
version_id_counter = 0
lock = threading.Lock()

def create_article(title, content, author_id, category):
    global article_id_counter
    with lock:
        if not title or not content:
            raise ValueError("Title and content are required")
        
        article_id_counter += 1
        article_id = article_id_counter
        
        article = {
            'id': article_id,
            'title': title,
            'content': content,
            'author_id': author_id,
            'category': category,
            'status': 'draft',
            'created_at': datetime.now(),
            'updated_at': datetime.now(),
            'published_at': None,
            'current_version': 1
        }
        articles[article_id] = article
        
        save_version(article_id, 1, title, content, author_id)
        
        return article

def save_version(article_id, version_number, title, content, author_id):
    global version_id_counter
    version_id_counter += 1
    version_id = version_id_counter
    
    version = {
        'id': version_id,
        'article_id': article_id,
        'version_number': version_number,
        'title': title,
        'content': content,
        'author_id': author_id,
        'created_at': datetime.now()
    }
    
    if article_id not in article_versions:
        article_versions[article_id] = []
    article_versions[article_id].append(version)
    
    return version

def update_article(article_id, title=None, content=None, author_id=None):
    with lock:
        if article_id not in articles:
            raise ValueError("Article not found")
        
        article = articles[article_id]
        
        if article['status'] == 'published':
            raise ValueError("Cannot edit published article")
        
        if title:
            article['title'] = title
        if content:
            article['content'] = content
        
        article['updated_at'] = datetime.now()
        article['current_version'] += 1
        
        save_version(article_id, article['current_version'], 
                    article['title'], article['content'], author_id)
        
        return article

def submit_for_review(article_id, author_id):
    with lock:
        if article_id not in articles:
            raise ValueError("Article not found")
        
        article = articles[article_id]
        
        if article['status'] != 'draft':
            raise ValueError("Only draft articles can be submitted")
        
        article['status'] = 'review'
        article['updated_at'] = datetime.now()
        
        workflow = {
            'article_id': article_id,
            'submitted_by': author_id,
            'submitted_at': datetime.now(),
            'status': 'pending',
            'reviewer_id': None,
            'reviewed_at': None
        }
        workflows[article_id] = workflow
        
        return article

def approve_article(article_id, reviewer_id):
    with lock:
        if article_id not in articles:
            raise ValueError("Article not found")
        
        article = articles[article_id]
        
        if article['status'] != 'review':
            raise ValueError("Article not in review")
        
        article['status'] = 'approved'
        article['updated_at'] = datetime.now()
        
        if article_id in workflows:
            workflows[article_id]['status'] = 'approved'
            workflows[article_id]['reviewer_id'] = reviewer_id
            workflows[article_id]['reviewed_at'] = datetime.now()
        
        return article

def reject_article(article_id, reviewer_id, reason):
    with lock:
        if article_id not in articles:
            raise ValueError("Article not found")
        
        article = articles[article_id]
        
        if article['status'] != 'review':
            raise ValueError("Article not in review")
        
        if not reason:
            raise ValueError("Rejection reason is required")
        
        article['status'] = 'draft'
        article['updated_at'] = datetime.now()
        
        if article_id in workflows:
            workflows[article_id]['status'] = 'rejected'
            workflows[article_id]['reviewer_id'] = reviewer_id
            workflows[article_id]['reviewed_at'] = datetime.now()
            workflows[article_id]['rejection_reason'] = reason
        
        return article

def publish_article(article_id):
    with lock:
        if article_id not in articles:
            raise ValueError("Article not found")
        
        article = articles[article_id]
        
        if article['status'] != 'approved':
            raise ValueError("Only approved articles can be published")
        
        article['status'] = 'published'
        article['published_at'] = datetime.now()
        article['updated_at'] = datetime.now()
        
        return article

def unpublish_article(article_id):
    with lock:
        if article_id not in articles:
            raise ValueError("Article not found")
        
        article = articles[article_id]
        
        if article['status'] != 'published':
            raise ValueError("Article not published")
        
        article['status'] = 'draft'
        article['published_at'] = None
        article['updated_at'] = datetime.now()
        
        return article

def get_article(article_id):
    if article_id not in articles:
        raise ValueError("Article not found")
    return articles[article_id]

def get_article_versions(article_id):
    if article_id not in article_versions:
        return []
    return article_versions[article_id]

def get_version(article_id, version_number):
    if article_id not in article_versions:
        raise ValueError("Article not found")
    
    if version_number <= 0:
        raise ValueError("Invalid version number")
    
    for version in article_versions[article_id]:
        if version['version_number'] == version_number:
            return version
    
    raise ValueError("Version not found")

def revert_to_version(article_id, version_number, author_id):
    with lock:
        if article_id not in articles:
            raise ValueError("Article not found")
        
        article = articles[article_id]
        
        if article['status'] == 'published':
            raise ValueError("Cannot revert published article")
        
        version = get_version(article_id, version_number)
        
        article['title'] = version['title']
        article['content'] = version['content']
        article['updated_at'] = datetime.now()
        article['current_version'] += 1
        
        save_version(article_id, article['current_version'], 
                    version['title'], version['content'], author_id)
        
        return article

def list_articles(status=None, category=None, author_id=None):
    result = []
    for article in articles.values():
        if status and article['status'] != status:
            continue
        if category and article['category'] != category:
            continue
        if author_id and article['author_id'] != author_id:
            continue
        result.append(article)
    return result

def search_articles(query):
    if not query:
        return []
    result = []
    query_lower = query.lower()
    for article in articles.values():
        if query_lower in article['title'].lower() or query_lower in article['content'].lower():
            result.append(article)
    return result

def get_workflow(article_id):
    if article_id not in workflows:
        return None
    return workflows[article_id]