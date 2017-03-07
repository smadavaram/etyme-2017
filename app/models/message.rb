class Message < ActiveRecord::Base
  belongs_to :messageable, polymorphic: true
  belongs_to :chat
  after_create :trigger_pusher

  def trigger_pusher
    Pusher.trigger(self.chat.channel_name, 'send-message', {message: self.id })
  end


end
