# frozen_string_literal: true

class Company::ChatsController < Company::BaseController
  before_action :find_chat, only: %i[show add_users]

  def show
    @messages = @chat.try(:messages)
  end

  def add_users
    users = params[:chat][:user_ids]
    users = users.reject(&:empty?)
    user_ids = users.map(&:to_i)
    user_ids.each do |user_id|
      user = current_company.try(:users).find(user_id)
      @chat.chat_users.create(userable: user)
      user.notifications.create(message: "<p>  #{current_user.full_name} Invited You To Chat <a href= 'http://#{current_user.company.etyme_url}/#{company_chat_path(@chat)}' > #{@chat.try(:chatable).try(:title)} </a> </p> <br> ", title: 'Chat Invitation')
    end
    flash[:success] = "User Added In Chat #{@chat.try(:chatable).try(:title)}"
    redirect_back fallback_location: root_path
  end

  private

  def find_chat
    @chats = current_user.try(:chats)
    @chat_groups = @chats.group_by(&:chatable_type)
    @chat = current_user.chats.find(params[:id] || params[:chat_id]) || []
  end

  def chat_params
    params.require(:chat).permit(user_ids: [])
  end
end
