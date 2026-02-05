export interface Article {
  id: string | number;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  author: string;
  publishedAt: string;
  imageUrl: string;
}

export const articles: Article[] = [
  {
    id: 1,
    title: "Global Climate Summit Reaches Historic Agreement",
    excerpt: "World leaders have reached a groundbreaking consensus on carbon reduction targets, marking a significant milestone in international climate cooperation.",
    content: "In a historic moment for global environmental policy, representatives from over 190 countries have agreed to ambitious new carbon reduction targets at the annual Climate Summit. The agreement, which was reached after two weeks of intensive negotiations, commits participating nations to reduce greenhouse gas emissions by 50% by 2030 compared to 2020 levels. Environmental activists have praised the deal as the most significant climate action since the Paris Agreement, while acknowledging that implementation will require substantial economic and social transformation. The summit also established a $100 billion annual fund to support developing nations in their transition to renewable energy sources. Scientists warn that without immediate action, the world faces catastrophic consequences including rising sea levels, extreme weather events, and mass species extinction.",
    category: "World",
    author: "Sarah Johnson",
    publishedAt: "2024-01-15",
    imageUrl: "https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=800&h=600&fit=crop"
  },
  {
    id: 2,
    title: "Revolutionary AI Model Breaks Language Barriers",
    excerpt: "A new artificial intelligence system can translate between 200 languages in real-time, potentially transforming global communication.",
    content: "Tech researchers have unveiled a revolutionary artificial intelligence model capable of translating between 200 languages in real-time with unprecedented accuracy. The system, developed by a consortium of leading technology companies, uses advanced neural network architectures to understand context, cultural nuances, and idiomatic expressions across diverse linguistic families. Early testing shows the AI achieves 95% accuracy in professional translation tasks, significantly outperforming previous systems. The technology has immediate applications in international business, education, and diplomacy, with potential to break down communication barriers that have persisted for centuries. Critics raise concerns about job displacement for human translators and the need for careful oversight to prevent misuse. The developers have committed to making the core technology open-source while maintaining ethical guidelines for its deployment.",
    category: "Technology",
    author: "Michael Chen",
    publishedAt: "2024-01-14",
    imageUrl: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&h=600&fit=crop"
  },
  {
    id: 3,
    title: "Championship Finals Set to Break Viewership Records",
    excerpt: "The upcoming championship game is expected to attract over 200 million viewers worldwide, making it one of the most-watched sporting events in history.",
    content: "Sports analysts are predicting record-breaking viewership for this year's championship finals, with early projections suggesting over 200 million viewers will tune in globally. The matchup features two powerhouse teams that have dominated their respective conferences throughout the season, creating unprecedented excitement among fans. Television networks have invested heavily in production technology, including 4K cameras, drone footage, and augmented reality graphics to enhance the viewing experience. Ticket sales for the event sold out within minutes, with resale prices reaching astronomical levels. The game represents not just a sporting event but a cultural phenomenon, with cities across both teams' regions planning massive watch parties and celebrations. Corporate sponsors have committed over $500 million in advertising, reflecting the event's massive commercial appeal.",
    category: "Sports",
    author: "David Martinez",
    publishedAt: "2024-01-13",
    imageUrl: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&h=600&fit=crop"
  },
  {
    id: 4,
    title: "Award-Winning Film Premieres to Critical Acclaim",
    excerpt: "The latest film from acclaimed director has premiered at the international film festival, receiving standing ovations and early Oscar buzz.",
    content: "The highly anticipated film premiered to a packed theater at the international film festival, immediately generating Oscar buzz and critical acclaim. The director, known for previous award-winning works, has created what many critics are calling a masterpiece of contemporary cinema. The film explores themes of identity, loss, and redemption through stunning cinematography and powerful performances from its ensemble cast. Early reviews praise the film's emotional depth, innovative storytelling techniques, and its ability to resonate across cultural boundaries. The premiere was attended by numerous celebrities, filmmakers, and industry executives, all of whom were visibly moved by the screening. Distribution rights have already been secured in over 50 countries, with a wide theatrical release planned for next month. Film scholars are already analyzing the work's cultural significance and its potential impact on the future of cinema.",
    category: "Entertainment",
    author: "Emily Rodriguez",
    publishedAt: "2024-01-12",
    imageUrl: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&h=600&fit=crop"
  },
  {
    id: 5,
    title: "International Trade Agreement Reshapes Global Economy",
    excerpt: "A new multilateral trade pact between major economic powers promises to reduce tariffs and streamline cross-border commerce.",
    content: "Representatives from the world's largest economies have signed a comprehensive trade agreement that promises to reshape international commerce. The pact eliminates tariffs on thousands of products, establishes common standards for digital trade, and creates new dispute resolution mechanisms. Economists predict the agreement could boost global GDP by 2-3% over the next decade while creating millions of new jobs across participating countries. The negotiations, which spanned three years, addressed complex issues including intellectual property rights, environmental standards, and labor protections. Small businesses are expected to benefit significantly from reduced trade barriers, gaining access to new markets previously too expensive to enter. Critics of the agreement raise concerns about potential job losses in certain sectors and the need for stronger environmental protections. Implementation will occur in phases over the next five years, with monitoring committees established to ensure compliance.",
    category: "World",
    author: "James Wilson",
    publishedAt: "2024-01-11",
    imageUrl: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&h=600&fit=crop"
  },
  {
    id: 6,
    title: "Breakthrough in Quantum Computing Achieves New Milestone",
    excerpt: "Scientists have successfully demonstrated quantum supremacy in solving complex optimization problems, opening new possibilities for scientific research.",
    content: "A team of quantum computing researchers has achieved a major breakthrough, demonstrating that their quantum computer can solve optimization problems exponentially faster than classical computers. The experiment involved a 100-qubit quantum processor that successfully completed calculations that would take the world's fastest supercomputer thousands of years to solve. This milestone, known as quantum supremacy, represents a significant step forward in the development of practical quantum computing applications. Potential uses include drug discovery, financial modeling, cryptography, and climate simulation. The research team spent five years developing error-correction techniques that allow the quantum system to maintain coherence long enough to complete complex calculations. Major technology companies and governments have invested billions in quantum computing research, recognizing its potential to revolutionize multiple industries. However, experts caution that practical applications remain years away, with significant engineering challenges still to overcome.",
    category: "Technology",
    author: "Lisa Anderson",
    publishedAt: "2024-01-10",
    imageUrl: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800&h=600&fit=crop"
  },
  {
    id: 7,
    title: "Olympic Athlete Sets New World Record",
    excerpt: "In a stunning performance, the athlete shattered the previous world record by over two seconds, cementing their place in sports history.",
    content: "In what many are calling the greatest athletic performance of the decade, an Olympic athlete has shattered the world record in their event by an unprecedented margin. The record-breaking performance came during the final day of competition, with the athlete delivering a flawless execution that left spectators and competitors in awe. The previous record had stood for eight years, with many experts believing it would remain unbroken for at least another decade. The athlete's training regimen, which includes cutting-edge sports science techniques and personalized nutrition plans, has been studied by coaches worldwide. The victory represents the culmination of years of dedication, overcoming injuries, and pushing the boundaries of human physical capability. Sports historians are already comparing the achievement to legendary performances from past decades. The athlete has become an inspiration to millions, demonstrating that with determination and innovation, seemingly impossible barriers can be overcome.",
    category: "Sports",
    author: "Robert Taylor",
    publishedAt: "2024-01-09",
    imageUrl: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=600&fit=crop"
  },
  {
    id: 8,
    title: "Music Festival Announces Stellar Lineup",
    excerpt: "The annual music festival has revealed its lineup featuring over 100 artists including multiple Grammy winners and emerging talents.",
    content: "Organizers of the world's largest music festival have announced an extraordinary lineup that includes Grammy-winning artists, chart-topping performers, and emerging talents from around the globe. The festival, which spans four days across multiple stages, promises to deliver an unparalleled musical experience for attendees. The lineup represents diverse genres including rock, pop, electronic, hip-hop, and world music, ensuring something for every musical taste. Early ticket sales have broken previous records, with over 200,000 tickets sold in the first 24 hours. The festival has also announced new sustainability initiatives, including carbon-neutral transportation options and zero-waste food vendors. Music critics are particularly excited about several rare collaborations and surprise performances that have been hinted at. The event has become a cultural touchstone, attracting not just music fans but also fashion designers, filmmakers, and artists who draw inspiration from the creative atmosphere.",
    category: "Entertainment",
    author: "Jennifer Lee",
    publishedAt: "2024-01-08",
    imageUrl: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&h=600&fit=crop"
  },
  {
    id: 9,
    title: "Diplomatic Crisis Resolved Through Multilateral Talks",
    excerpt: "Intensive diplomatic negotiations have successfully de-escalated tensions between nations, preventing potential conflict.",
    content: "A potentially dangerous international crisis has been successfully resolved through intensive multilateral diplomatic negotiations. The situation, which had escalated over several months, threatened to destabilize regional security and disrupt global trade routes. Diplomats from multiple countries worked around the clock, conducting secret negotiations and shuttle diplomacy to find a peaceful resolution. The breakthrough came after all parties agreed to a framework that addresses core concerns while maintaining regional stability. International observers have praised the diplomatic efforts, noting that the resolution demonstrates the continued effectiveness of multilateral institutions in preventing conflict. The agreement includes provisions for ongoing monitoring and regular dialogue to prevent future escalations. Economic markets responded positively to the news, with global stock indices rising on the announcement. The successful resolution serves as a reminder of the importance of diplomacy and international cooperation in maintaining world peace.",
    category: "World",
    author: "Patricia Brown",
    publishedAt: "2024-01-07",
    imageUrl: "https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=800&h=600&fit=crop"
  },
  {
    id: 10,
    title: "New Smartphone Features Revolutionary Camera Technology",
    excerpt: "The latest flagship smartphone introduces groundbreaking camera capabilities that rival professional photography equipment.",
    content: "A leading technology company has unveiled its newest flagship smartphone featuring revolutionary camera technology that challenges professional photography equipment. The device includes a triple-lens system with advanced computational photography algorithms that can capture stunning images in any lighting condition. The camera's night mode can produce clear, detailed photos in near-total darkness, while its portrait mode uses machine learning to create professional-quality depth-of-field effects. Early reviews from professional photographers have been overwhelmingly positive, with many noting that the smartphone can now replace dedicated cameras for most use cases. The device also features 8K video recording capabilities and advanced stabilization technology that eliminates camera shake. The company invested over $1 billion in camera research and development, working with optics experts and software engineers to create the system. Photography enthusiasts and professionals are already pre-ordering the device in record numbers, with initial shipments expected to sell out quickly.",
    category: "Technology",
    author: "Daniel Kim",
    publishedAt: "2024-01-06",
    imageUrl: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&h=600&fit=crop"
  },
  {
    id: 11,
    title: "Championship Tournament Kicks Off with Upset Victories",
    excerpt: "The opening rounds of the championship tournament have already produced several major upsets, with underdog teams defeating favorites.",
    content: "The championship tournament has begun with a series of stunning upsets that have reshaped expectations for the competition. Several teams that were considered favorites have been eliminated in early rounds, while underdog teams have delivered impressive performances that have captured the attention of sports fans worldwide. Analysts are calling this one of the most unpredictable tournaments in recent memory, with the competitive balance creating exciting matchups throughout the bracket. The upsets have generated significant media attention and social media buzz, with fans celebrating the unpredictability of sports. Coaches and players from the victorious underdog teams have expressed pride in their performances while acknowledging the challenges ahead. The tournament format, which includes single-elimination rounds, creates an environment where any team can emerge victorious on any given day. Sports betting markets have been thrown into chaos by the unexpected results, with odds shifting dramatically after each upset.",
    category: "Sports",
    author: "Amanda White",
    publishedAt: "2024-01-05",
    imageUrl: "https://images.unsplash.com/photo-1551958219-acbc608c6377?w=800&h=600&fit=crop"
  },
  {
    id: 12,
    title: "Streaming Platform Launches Original Series",
    excerpt: "A major streaming service has released its highly anticipated original series, featuring A-list actors and acclaimed directors.",
    content: "A leading streaming platform has launched its most ambitious original series to date, featuring an ensemble cast of A-list actors and direction from multiple award-winning filmmakers. The series, which represents a $200 million production investment, spans multiple genres and tells interconnected stories across different time periods and locations. Early reviews praise the series for its innovative storytelling, high production values, and compelling character development. The platform has released all episodes simultaneously, allowing viewers to binge-watch the entire season. The series has already generated significant social media buzz, with fans creating theories about plot developments and character relationships. Industry analysts predict the series could become one of the most-watched original programs in streaming history. The production employed thousands of crew members and utilized cutting-edge visual effects technology to create immersive worlds. The series represents the platform's strategy of investing heavily in original content to compete in the increasingly crowded streaming market.",
    category: "Entertainment",
    author: "Christopher Davis",
    publishedAt: "2024-01-04",
    imageUrl: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&h=600&fit=crop"
  }
];

