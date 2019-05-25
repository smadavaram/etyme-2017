class ConversationMute < ApplicationRecord

  belongs_to :conversation
  belongs_to :mutable, polymorphic: true

  validates_uniqueness_of :conversation_id, scope: :mutable

end
