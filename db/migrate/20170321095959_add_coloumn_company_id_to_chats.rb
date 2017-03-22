class AddColoumnCompanyIdToChats < ActiveRecord::Migration
  def change
    add_column :chats, :company_id, :integer
  end
end
