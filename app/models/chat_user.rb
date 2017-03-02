class ChatUser < ActiveRecord::Base
  belongs_to :userable      , polymorphic: true
  belongs_to :chat
end
