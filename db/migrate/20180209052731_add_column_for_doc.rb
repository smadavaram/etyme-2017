class AddColumnForDoc < ActiveRecord::Migration[5.1]
  def change
    add_column :sell_send_documents, :file_name, :string
    add_column :sell_send_documents, :file_size, :integer
    add_column :sell_send_documents, :file_type, :integer

    add_column :sell_request_documents, :file_name, :string
    add_column :sell_request_documents, :file_size, :integer
    add_column :sell_request_documents, :file_type, :integer

    add_column :buy_send_documents, :file_name, :string
    add_column :buy_send_documents, :file_size, :integer
    add_column :buy_send_documents, :file_type, :integer

    add_column :buy_emp_req_docs, :file_name, :string
    add_column :buy_emp_req_docs, :file_size, :integer
    add_column :buy_emp_req_docs, :file_type, :integer

    add_column :buy_ven_req_docs, :file_name, :string
    add_column :buy_ven_req_docs, :file_size, :integer
    add_column :buy_ven_req_docs, :file_type, :integer

  end
end
