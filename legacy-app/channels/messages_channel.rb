# frozen_string_literal: true

class MessagesChannel < ApplicationCable::Channel
  def subscribed
    stream_from "Message_#{current_user.class.to_s == 'Candidate' ? 'Candidate' : 'User'}_#{current_user.id}"
    # current_user.update_column(:is_online, true)
    # puts "web_notifications_#{current_user.id}"
  end

  def unsubscribed
    # current_user.update_column(:is_online, false)
  end

  def send_notification(data)
    puts data
  end

  def notify(data)
    puts data
  end
end
