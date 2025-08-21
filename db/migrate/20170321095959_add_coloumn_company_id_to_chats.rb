class AddColoumnCompanyIdToChats < ActiveRecord::Migration[4.2]
  def change
    add_column :chats, :company_id, :integer
  end
end
