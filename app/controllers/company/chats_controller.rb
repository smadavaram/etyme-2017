class Company::ChatsController < Company::BaseController
  before_action :find_chat , only:  [:show]

  def show
    @messages = @chat.try(:messages)
  end

  private

  def find_chat
    @chats  = current_user.try(:chats)
    @chat = current_user.chats.find(params[:id])
  end


end
