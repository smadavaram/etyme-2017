# frozen_string_literal: true

class Company::ConversationMessagesController < Company::BaseController
  before_action :set_conversation
  skip_before_action :authenticate_user!, only: :mark_as_read

  def create
    message = ConversationMessage.new(message_params.merge(conversation_id: @conversation.id))
    message.userable = current_user
    recipient = (@conversation.recipientable == current_user ? @conversation.senderable : @conversation.recipientable)
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

      ActionCable.server.broadcast "Message_#{current_user.class}_#{current_user.id}",
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

  def mark_as_read
    ConversationMessage.where(conversation_id: params[:conversation_id], id: params[:id]).update_all(is_read: true)
    render json: :ok
  end

  private

  def set_conversation
    @conversation = Conversation.find(params[:conversation_id])
  end

  def message_params
    params.require(:conversation_message).permit(:body, :file_url)
  end
end
