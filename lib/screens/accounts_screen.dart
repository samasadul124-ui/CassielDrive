import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cassiel_drive/core/theme/app_theme.dart';
import 'package:cassiel_drive/providers/auth_provider.dart';
import 'package:cassiel_drive/screens/settings_screen.dart';
import 'package:cassiel_drive/services/storage_orchestrator.dart';

import 'package:cassiel_drive/widgets/account_tile.dart';

class AccountsScreen extends StatefulWidget {
  const AccountsScreen({super.key});

  @override
  State<AccountsScreen> createState() => _AccountsScreenState();
}

class _AccountsScreenState extends State<AccountsScreen> {
  bool _isAdding = false;

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final orchestrator = StorageOrchestrator();
    final accounts = authProvider.accounts;
    final scores = orchestrator.getAllScores(accounts);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 800),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 16),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Text('Accounts', style: Theme.of(context).textTheme.headlineLarge),
                ),
            const SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text(
                '${accounts.length} connected account${accounts.length != 1 ? 's' : ''}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
            const SizedBox(height: 20),
            Expanded(
              child: accounts.isEmpty
                  ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Icon(Icons.person_add_rounded, size: 64, color: Colors.white.withAlpha(51)),
                      const SizedBox(height: 16),
                      Text('No accounts connected', style: Theme.of(context).textTheme.titleLarge?.copyWith(color: Colors.white.withAlpha(77))),
                      const SizedBox(height: 8),
                      Text('Add a Google account to get started', style: Theme.of(context).textTheme.bodySmall),
                    ]))
                  : ListView.builder(
                      itemCount: accounts.length,
                      padding: const EdgeInsets.only(bottom: 100),
                      itemBuilder: (context, index) {
                        final account = accounts[index];
                        return AccountTile(
                          account: account,
                          score: scores[account.id],
                          onRemove: () => _confirmRemove(context, account.id, account.email),
                        );
                      },
                    ),
            ),
          ],
        ),
          ),
        ),
      ),
      floatingActionButton: Padding(
        padding: const EdgeInsets.only(bottom: 90),
        child: FloatingActionButton.extended(
          onPressed: _isAdding ? null : _addAccount,
          backgroundColor: _isAdding
              ? Theme.of(context).primaryColor.withAlpha(150)
              : Theme.of(context).primaryColor,
          icon: _isAdding
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white),
                )
              : const Icon(Icons.add_rounded, color: Colors.white),
          label: Text(_isAdding ? 'Connecting…' : 'Add Account',
              style: const TextStyle(
                  fontFamily: 'Inter',
                  fontWeight: FontWeight.w600,
                  color: Colors.white)),
        ),
      ),
    );
  }

  Future<void> _addAccount() async {
    if (_isAdding) return;

    final authProvider = context.read<AuthProvider>();
    final messenger = ScaffoldMessenger.of(context);

    // Without a Client ID / Secret the OAuth flow can never start, which is
    // exactly why the button used to look like it did nothing at all.
    final hasCredentials = await authProvider.hasOAuthCredentials();
    if (!mounted) return;
    if (!hasCredentials) {
      await _promptForCredentials();
      return;
    }

    setState(() => _isAdding = true);
    messenger.showSnackBar(
      SnackBar(
        content: Text(kIsWeb
            ? 'Opening authentication popup…'
            : 'Opening browser for Google Sign-In…'),
        backgroundColor: Theme.of(context).primaryColor,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        duration: const Duration(seconds: 3),
      ),
    );

    bool success = false;
    try {
      success = await authProvider.addAccount();
    } finally {
      if (mounted) setState(() => _isAdding = false);
    }

    if (!mounted) return;
    messenger.clearSnackBars();
    messenger.showSnackBar(
      SnackBar(
        content: Text(success
            ? 'Google account added successfully!'
            : (authProvider.error ?? 'Failed to add account.')),
        backgroundColor: success ? AppColors.success : AppColors.error,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        duration: Duration(seconds: success ? 3 : 6),
      ),
    );
  }

  Future<void> _promptForCredentials() async {
    final openSettings = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Theme.of(ctx).brightness == Brightness.dark
            ? const Color(0xFF1A1A2E)
            : Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: const Text('Google OAuth not configured'),
        content: const Text(
          'Cassiel Drive needs your own Google OAuth Client ID and Client '
          'Secret before it can connect a Drive account.\n\n'
          'Add them in Settings, then tap "Add Account" again.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Later')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Open Settings')),
        ],
      ),
    );

    if (openSettings == true && mounted) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => const SettingsScreen()),
      );
    }
  }

  void _confirmRemove(BuildContext context, String accountId, String email) {
    showDialog(context: context, builder: (ctx) => AlertDialog(
      backgroundColor: Theme.of(context).brightness == Brightness.dark ? const Color(0xFF1A1A2E) : Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      title: const Text('Remove Account'),
      content: Text('Remove $email from Cassiel Drive?'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        TextButton(onPressed: () { context.read<AuthProvider>().removeAccount(accountId); Navigator.pop(ctx); },
          child: const Text('Remove', style: TextStyle(color: AppColors.error))),
      ],
    ));
  }
}
