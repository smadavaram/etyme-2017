class CreatePorposalChats < ActiveRecord::Migration[5.2]
  def change
    create_table :porposal_chats do |t|
      t.integer "company_id"
      t.timestamps
    end
  end
end
