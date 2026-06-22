class Todo {
  final String id;
  final String title;
  final String category;
  final String assignee;
  final bool done;
  final String? deadline;
  final String? segmentId;
  final String? bookingId;

  const Todo({
    required this.id,
    required this.title,
    required this.category,
    required this.assignee,
    this.done = false,
    this.deadline,
    this.segmentId,
    this.bookingId,
  });

  factory Todo.fromJson(Map<String, dynamic> j) => Todo(
    id:        j['id']?.toString() ?? '',
    title:     j['title']?.toString() ?? '',
    category:  j['category']?.toString() ?? 'do',
    assignee:  j['assignee']?.toString() ?? 'both',
    done:      j['done'] as bool? ?? false,
    deadline:  j['deadline']?.toString(),
    segmentId: j['segment_id']?.toString(),
    bookingId: j['booking_id']?.toString(),
  );

  Todo copyWith({bool? done}) => Todo(
    id:        id,
    title:     title,
    category:  category,
    assignee:  assignee,
    done:      done ?? this.done,
    deadline:  deadline,
    segmentId: segmentId,
    bookingId: bookingId,
  );
}

class Segment {
  final String id;
  final String location;
  final int sortOrder;

  const Segment({required this.id, required this.location, required this.sortOrder});

  factory Segment.fromJson(Map<String, dynamic> j) => Segment(
    id:        j['id']?.toString() ?? '',
    location:  j['location']?.toString() ?? '',
    sortOrder: (j['sort_order'] as num?)?.toInt() ?? 0,
  );
}
