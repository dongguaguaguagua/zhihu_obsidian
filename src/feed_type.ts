export interface Answer {
	id: string;
	type: string;
	title: string; // question title
	author_name: string;
	author_avatar_url: string;
	author_headline: string;
	author_url: string;
	voteup_count: number;
	comment_count: number;
	thanks_count: number;
	updated_time: number;
	created_time: number;
	url: string;
	content: string;
	excerpt: string;
}

export interface Article {
	id: string;
	type: string;
	title: string;
	author_name: string;
	author_avatar_url: string;
	author_headline: string;
	author_url: string;
	voteup_count: number;
	comment_count: number;
	thanks_count: number;
	updated_time: number;
	created_time: number;
	url: string;
	content: string;
	excerpt: string;
}

export interface Question {
	id: string;
	type: string;
	title: string;
	author_name: string;
	author_avatar_url: string;
	author_headline: string;
	author_url: string;
	answer_count: number;
	comment_count: number;
	url: string;
	detail: string;
	excerpt: string;
}

export interface Pin {
	id: string;
	type: string;
	title: string;
	author_name: string;
	author_avatar_url: string;
	author_headline: string;
	author_url: string;
	comment_count: number;
	favorite_count: number;
	favlists_count: number;
	like_count: number;
	reaction_count: number;
	updated_time: number;
	created_time: number;
	url: string;
	content_html: string;
	excerpt_title: string;
}
