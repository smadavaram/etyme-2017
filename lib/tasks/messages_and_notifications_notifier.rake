# frozen_string_literal: true

# Rails.application.load_tasks
# Rake::Task['subscription_expiry_reminder:reminder'].invoke
namespace :messages_and_notifications_notifier do
  desc 'Sends email about notifications and chat messages to user'
  task reminder: :environment do
    start_time = DateTime.now
    past_time = start_time - 2.hours
    messages = ConversationMessage.where('created_at BETWEEN ? AND ?', past_time, start_time)
    messages.each do |message|
      message.conversation.chatable.groupables.each do |groupable|
        next if message.userable == groupable.groupable

        user = groupable.groupable
        notifications = user.notifications.where('created_at BETWEEN ? AND ?', past_time, start_time)
        messages = ConversationMessage.joins(:conversation).where(conversation: Conversation.all_onversations(user)).where('conversation_messages.created_at BETWEEN ? AND ?', past_time, start_time)
        NotificationMailer.chat_and_notification_notifier(notifications, messages, user.email).deliver if notifications.present? || messages.present?
      end
    end
  end
end
