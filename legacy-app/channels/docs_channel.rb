# frozen_string_literal: true

class DocsChannel < ApplicationCable::Channel
  def subscribed
    stream_from "Doc_User_#{current_user.id}"
  end

  def unsubscribed; end

  def send_notification(data); end

  def notify(data); end
end
