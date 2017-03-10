class ChatUser < ActiveRecord::Base
  belongs_to :userable      , polymorphic: true
  belongs_to :chat
  validates_uniqueness_of :chat_id ,scope: [:userable_id,:userable_type]
end
