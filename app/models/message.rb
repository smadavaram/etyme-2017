class Message < ActiveRecord::Base
  belongs_to :messageable, polymorphic: true
  belongs_to :chat
end
