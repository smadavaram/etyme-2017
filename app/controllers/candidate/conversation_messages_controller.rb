# frozen_string_literal: true

class Candidate::ConversationMessagesController < Candidate::BaseController
  before_action :set_conversation

  def create
    message = ConversationMessage.new(message_params.merge(conversation_id: @conversation.id))
    message.userable = current_candidate
    recipient = (@conversation.recipientable == current_candidate ? @conversation.senderable : @conversation.recipientable)
    if message.save
      ActionCable.server.broadcast "Message_#{recipient.class}_#{recipient.id}",
                                   message_id: message.id,
                                   message: message.body,
                                   file_url: message.file_url || '',
                                   user_type: message.userable.class.to_s,
                                   user: message.userable.id,
                                   recipient_type: recipient.class.to_s,
                                   recipient_id: recipient.id,
                                   unread_message_count: Conversation.joins(:conversation_messages).where('(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)', recipient.class.to_s, recipient.id, recipient.class.to_s, recipient.id).where.not(conversation_messages: { is_read: true, userable: recipient }).uniq.count,
                                   conversation_id: @conversation.id,
                                   dom: "#conversation_#{@conversation.id}"

      ActionCable.server.broadcast "Message_#{current_candidate.class}_#{current_candidate.id}",
                                   message_id: message.id,
                                   message: message.body,
                                   file_url: message.file_url || '',
                                   user_type: message.userable.class.to_s,
                                   user: message.userable.id,
                                   recipient_type: recipient.class.to_s,
                                   recipient_id: recipient.id,
                                   unread_message_count: Conversation.joins(:conversation_messages).where('(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)', recipient.class.to_s, recipient.id, recipient.class.to_s, recipient.id).where.not(conversation_messages: { is_read: true, userable: recipient }).uniq.count,
                                   conversation_id: @conversation.id,
                                   dom: "#conversation_#{@conversation.id}"

      head :ok
    else
      head :ok
    end
  end

  private

  def set_conversation
    @conversation = Conversation.find(params[:conversation_id])
  end

  def message_params
    params.require(:conversation_message).permit(:body, :file_url)
  end
end
