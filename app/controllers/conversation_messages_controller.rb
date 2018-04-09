class ConversationMessagesController < ApplicationController
  before_action :set_conversation
  # skip_before_action :authenticate_user!, only: :mark_as_read

  def create
    message = ConversationMessage.new(message_params.merge({conversation_id: @conversation.id}))
    message.userable = get_current_user
    if message.save
      if @conversation.chatable_type == "Group"
        @conversation.chatable.groupables.each do |gm|
          GroupMsgNotify.create(group_id: @conversation.chatable.id, member: gm.groupable, conversation_message: message)
          ActionCable.server.broadcast "Message_#{gm.groupable_type}_#{gm.groupable_id}",
                                       message_id: message.id,
                                       message: message.body,
                                       user_type: message.userable.class.to_s,
                                       user: message.userable.id,
                                       recipient_type: gm.groupable_type,
                                       recipient_id: gm.groupable_id,
                                       unread_message_count: 0, # Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", recipient.class.to_s, recipient.id, recipient.class.to_s, recipient.id).where.not(conversation_messages: {is_read: true, userable: recipient}).uniq.count,
                                       conversation_id: @conversation.id,
                                       chat_type: "Group",
                                       group_id: @conversation.chatable.id,
                                       dom: "#conversation_#{@conversation.id}"
        end
        @conversation.chatable.company.users.each do |usr|
          GroupMsgNotify.create(group_id: @conversation.chatable.id, member: usr, conversation_message: message)
          ActionCable.server.broadcast "Message_#{usr.class}_#{usr.id}",
                                       message_id: message.id,
                                       message: message.body,
                                       user_type: message.userable.class.to_s,
                                       user: message.userable.id,
                                       recipient_type: usr.class,
                                       recipient_id: usr.id,
                                       unread_message_count: 0, # Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", recipient.class.to_s, recipient.id, recipient.class.to_s, recipient.id).where.not(conversation_messages: {is_read: true, userable: recipient}).uniq.count,
                                       conversation_id: @conversation.id,
                                       chat_type: "Group",
                                       group_id: @conversation.chatable.id,
                                       dom: "#conversation_#{@conversation.id}"
        end
      else
        recipient = (@conversation.recipientable == get_current_user ? @conversation.senderable : @conversation.recipientable )
        ActionCable.server.broadcast "Message_#{recipient.class.to_s}_#{recipient.id}",
                                     message_id: message.id,
                                     message: message.body,
                                     user_type: message.userable.class.to_s,
                                     user: message.userable.id,
                                     recipient_type: recipient.class.to_s,
                                     recipient_id: recipient.id,
                                     unread_message_count: Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", recipient.class.to_s, recipient.id, recipient.class.to_s, recipient.id).where.not(conversation_messages: {is_read: true, userable: recipient}).uniq.count,
                                     conversation_id: @conversation.id,
                                     chat_type: "OneToOne",
                                     dom: "#conversation_#{@conversation.id}"

        ActionCable.server.broadcast "Message_#{get_current_user.class.to_s}_#{get_current_user.id}",
                                     message_id: message.id,
                                     message: message.body,
                                     user_type: message.userable.class.to_s,
                                     user: message.userable.id,
                                     recipient_type: recipient.class.to_s,
                                     recipient_id: recipient.id,
                                     unread_message_count: Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", recipient.class.to_s, recipient.id, recipient.class.to_s, recipient.id).where.not(conversation_messages: {is_read: true, userable: recipient}).uniq.count,
                                     conversation_id: @conversation.id,
                                     chat_type: "OneToOne",
                                     dom: "#conversation_#{@conversation.id}"
      end
    end
    head :ok
  end

  def mark_as_read
    if params[:chat_type] == "Group"
      GroupMsgNotify.where(conversation_message_id: params[:id], group_id: params[:group_id],
                           member_type: params[:cnt_user_type], member_id: params[:cnt_user_id]).update_all(is_read: true)
    else
      ConversationMessage.where(conversation_id: params[:conversation_id], id: params[:id]).update_all(is_read: true)
    end
    render json: :ok
  end

  private

  def set_conversation
    @conversation = Conversation.find(params[:conversation_id])
  end

  def message_params
    params.require(:conversation_message).permit(:body)
  end

  def get_current_user
    if current_user.present?
      current_user
    elsif current_candidate.present?
      current_candidate
    end
  end

end