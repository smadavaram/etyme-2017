class Company::ChatsController < Company::BaseController
  before_action :find_chat , only:  [:show ,:add_users]

  def show
    @messages = @chat.try(:messages)
  end

  def add_users
    users = params[:chat][:user_ids]
    users = users.reject { |t| t.empty? }
    user_ids = users.map(&:to_i)
    user_ids.each do |user_id|
      user = current_company.try(:users).find(user_id)
      @chat.chat_users.create(userable_id: user.id , userable_type: user.class)
    end
    flash[:success] = "User Added In Chat #{@chat.try(:chatable).try(:title)}"
    redirect_to :back
  end

  private

  def find_chat
    @chats  = current_user.try(:chats)
    @chat = current_user.chats.find(params[:id] || params[:chat_id]) || []
  end

  def chat_params
    params.require(:chat).permit(user_ids: [])
  end
end
