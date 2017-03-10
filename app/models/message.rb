class Message < ActiveRecord::Base
  belongs_to :messageable, polymorphic: true
  belongs_to :chat
  after_create :trigger_pusher

  validates :body , presence:  :true

  def trigger_pusher
    Pusher.trigger(self.chat.channel_name, 'send-message', {message: self.id })
  end


end
